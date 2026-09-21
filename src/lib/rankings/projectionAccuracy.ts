// FantasyiQ Trust — Weekly Projection Accuracy Tracker
//
// Records, then reports on, how close FIQ's enhanced projection actually
// came to real results — a measured track record rather than a claimed one.
// Every row is standard-PPR points (STANDARD_SCORING), computed once per
// player-week after that week's games are final, so it's comparable across
// every league regardless of scoring format or which specific fantasy
// opponent a player happened to face that week.

import { prisma } from '@/lib/prisma';
import { getWeekRealStats } from '@/lib/sleeper';
import { computeRealPoints, STANDARD_SCORING } from './leagueScoringPoints';

// Same injury weights the live projection engine uses (projection-engine.ts
// injuryModifier) — the one FIQ modifier that's genuinely global, since it
// doesn't depend on which specific fantasy opponent/league a player faced.
// Opponent-defense-rank is deliberately excluded here: it's a per-league
// proxy (each fantasy league's own standings), not a single real number,
// so there's no league-agnostic way to fold it into a global accuracy row.
function injuryModifier(status: string | null | undefined): number {
    switch (status) {
        case 'Questionable': return -0.05;
        case 'Doubtful':     return -0.15;
        case 'Out':          return -0.25;
        case 'IR':           return -0.25;
        case 'PUP':          return -0.25;
        default:             return 0;
    }
}

/**
 * Records one accuracy row per player who actually played in the given
 * week — skips anyone with no real stats yet (game not final, bye, DNP).
 * Idempotent (upsert on [season, week, playerId]), safe to re-run.
 */
export async function recordWeeklyProjectionAccuracy(
    season: string,
    week:   number,
): Promise<{ recorded: number }> {
    const [projections, realStats] = await Promise.all([
        prisma.playerProjection.findMany({
            where:  { season, week },
            select: { playerId: true, pointsPpr: true },
        }),
        getWeekRealStats(season, week),
    ]);
    if (projections.length === 0) return { recorded: 0 };

    const playedIds = projections
        .map(p => p.playerId)
        .filter(pid => realStats[pid] && Object.keys(realStats[pid]).length > 0);
    if (playedIds.length === 0) return { recorded: 0 };

    const players = await prisma.sleeperPlayer.findMany({
        where:  { playerId: { in: playedIds } },
        select: { playerId: true, position: true, injuryStatus: true },
    });
    const playerById = new Map(players.map(p => [p.playerId, p]));
    const projByPlayer = new Map(projections.map(p => [p.playerId, p.pointsPpr]));

    const rows = playedIds
        .map(pid => {
            const info = playerById.get(pid);
            if (!info) return null;
            const sleeperProj = projByPlayer.get(pid) ?? 0;
            const fiqProj      = sleeperProj * (1 + injuryModifier(info.injuryStatus));
            const actual       = computeRealPoints(realStats[pid], STANDARD_SCORING);
            return { season, week, playerId: pid, position: info.position, sleeperProj, fiqProj, actual };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await Promise.all(batch.map(r => prisma.weeklyProjectionAccuracy.upsert({
            where:  { season_week_playerId: { season: r.season, week: r.week, playerId: r.playerId } },
            create: r,
            update: { position: r.position, sleeperProj: r.sleeperProj, fiqProj: r.fiqProj, actual: r.actual },
        }).catch(() => null)));
    }

    return { recorded: rows.length };
}

export interface PositionAccuracy {
    position:     string;
    avgErrorPct:  number;
    sampleSize:   number;
}

export interface SeasonAccuracySummary {
    season:            string;
    sampleSize:        number;
    fiqAvgErrorPct:    number;
    sleeperAvgErrorPct: number;
    byPosition:        PositionAccuracy[];
}

// Floors the denominator so a near-zero real score (a DNP-adjacent game)
// can't blow up a single row's percent error into something absurd and
// swamp the average — same principle as this codebase's other guardrails
// against small-sample distortion (FULL_SAMPLE_GAMES etc).
const MIN_ACTUAL_FOR_PCT = 3;

function pctError(proj: number, actual: number): number {
    return Math.abs(proj - actual) / Math.max(actual, MIN_ACTUAL_FOR_PCT);
}

/**
 * Season-to-date accuracy summary: FIQ vs Sleeper's own pre-game projection,
 * overall and broken down by position. Returns null if nothing's been
 * recorded yet for the season (e.g. before Week 1 finishes).
 */
export async function getSeasonProjectionAccuracy(season: string): Promise<SeasonAccuracySummary | null> {
    const rows = await prisma.weeklyProjectionAccuracy.findMany({
        where:  { season },
        select: { position: true, sleeperProj: true, fiqProj: true, actual: true },
    });
    if (rows.length === 0) return null;

    const fiqErrors     = rows.map(r => pctError(r.fiqProj, r.actual));
    const sleeperErrors = rows.map(r => pctError(r.sleeperProj, r.actual));
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

    const byPositionMap = new Map<string, number[]>();
    rows.forEach((r, i) => {
        if (!byPositionMap.has(r.position)) byPositionMap.set(r.position, []);
        byPositionMap.get(r.position)!.push(fiqErrors[i]);
    });
    const byPosition: PositionAccuracy[] = [...byPositionMap.entries()]
        .map(([position, errors]) => ({ position, avgErrorPct: avg(errors), sampleSize: errors.length }))
        .filter(p => p.sampleSize >= 10) // suppress noisy small-sample positions (e.g. early-season IDP)
        .sort((a, b) => a.avgErrorPct - b.avgErrorPct);

    return {
        season,
        sampleSize:         rows.length,
        fiqAvgErrorPct:      avg(fiqErrors),
        sleeperAvgErrorPct:  avg(sleeperErrors),
        byPosition,
    };
}
