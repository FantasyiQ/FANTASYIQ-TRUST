// FantasyiQ Trust — Real Position-vs-Defense Strength
//
// Replaces the old "rank fantasy opponents by their own roster's scoring"
// defense proxy — which had zero relationship to any real NFL defense —
// with a real, position-specific measure: how many fantasy points has each
// real NFL defense actually allowed to QBs / RBs / WRs / TEs this season,
// recorded from real stat lines once each week's games are final.

import { prisma } from '@/lib/prisma';
import { getWeekRealStats, getWeekOpponents } from '@/lib/sleeper';
import { computeRealPoints, STANDARD_SCORING } from './leagueScoringPoints';

// Same scope/rationale as projectionAccuracy.ts's TRACKED_POSITIONS —
// STANDARD_SCORING only has offensive stat keys, and K/DEF/IDP have no
// single "standard" scoring format to measure a real defensive matchup
// against fairly.
const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
const TRACKED_POSITION_SET = new Set<string>(TRACKED_POSITIONS);

/**
 * Records one (defenseTeam, position) row per real NFL defense that
 * actually played a game this week, from real stat lines. Idempotent
 * (upsert on [season, week, defenseTeam, position]), safe to re-run —
 * also how historical weeks get backfilled.
 */
export async function recordWeeklyDefenseVsPosition(
    season: string,
    week:   number,
): Promise<{ recorded: number }> {
    const [realStats, opponentByTeam] = await Promise.all([
        getWeekRealStats(season, week),
        getWeekOpponents(season, week),
    ]);

    const playedIds = Object.keys(realStats).filter(pid => Object.keys(realStats[pid]).length > 0);
    if (playedIds.length === 0) return { recorded: 0 };

    const players = await prisma.sleeperPlayer.findMany({
        where:  { playerId: { in: playedIds }, position: { in: [...TRACKED_POSITIONS] } },
        select: { playerId: true, position: true, team: true },
    });

    const buckets = new Map<string, { pointsAllowed: number; playersFaced: number }>();
    for (const p of players) {
        const opponent = p.team ? opponentByTeam[p.team] : undefined;
        if (!opponent) continue; // bye week, or a schedule gap for this team this week
        const points = computeRealPoints(realStats[p.playerId], STANDARD_SCORING);
        const key = `${opponent}|${p.position}`;
        const cur = buckets.get(key) ?? { pointsAllowed: 0, playersFaced: 0 };
        cur.pointsAllowed += points;
        cur.playersFaced  += 1;
        buckets.set(key, cur);
    }

    const rows = [...buckets.entries()].map(([key, v]) => {
        const [defenseTeam, position] = key.split('|');
        return { season, week, defenseTeam, position, pointsAllowed: v.pointsAllowed, playersFaced: v.playersFaced };
    });

    await Promise.all(rows.map(r => prisma.teamDefenseVsPosition.upsert({
        where: {
            season_week_defenseTeam_position: {
                season: r.season, week: r.week, defenseTeam: r.defenseTeam, position: r.position,
            },
        },
        create: r,
        update: { pointsAllowed: r.pointsAllowed, playersFaced: r.playersFaced },
    }).catch(() => null)));

    return { recorded: rows.length };
}

export interface DefenseRanking {
    // "TEAM|POSITION" -> rank (1 = allows the most points to that position,
    // i.e. the weakest/most-favorable-matchup defense against it).
    rankByTeamPosition: Map<string, number>;
    // How many real teams actually have data for that position yet, so a
    // rank can be interpolated correctly even early in the season before
    // every team has faced every position's full sample.
    totalByPosition: Map<string, number>;
}

/**
 * Builds season-to-date defensive rankings, separately per position, from
 * every recorded week so far. Call once per page render and reuse across
 * every player being projected that render — not once per player.
 */
export async function getDefenseRankByPosition(season: string): Promise<DefenseRanking> {
    const rows = await prisma.teamDefenseVsPosition.findMany({
        where:  { season },
        select: { defenseTeam: true, position: true, pointsAllowed: true, playersFaced: true },
    });

    const agg = new Map<string, { pts: number; n: number }>();
    for (const r of rows) {
        const key = `${r.defenseTeam}|${r.position}`;
        const cur = agg.get(key) ?? { pts: 0, n: 0 };
        cur.pts += r.pointsAllowed;
        cur.n   += r.playersFaced;
        agg.set(key, cur);
    }

    const rankByTeamPosition = new Map<string, number>();
    const totalByPosition    = new Map<string, number>();

    for (const position of TRACKED_POSITION_SET) {
        const entries = [...agg.entries()]
            .filter(([key]) => key.endsWith(`|${position}`))
            .map(([key, v]) => ({ team: key.split('|')[0], avg: v.n > 0 ? v.pts / v.n : 0 }))
            .sort((a, b) => b.avg - a.avg); // most points allowed first -> rank 1 = weakest defense

        entries.forEach((e, i) => rankByTeamPosition.set(`${e.team}|${position}`, i + 1));
        totalByPosition.set(position, entries.length);
    }

    return { rankByTeamPosition, totalByPosition };
}

/**
 * Resolves the real defensive rank a specific player faces this week, from
 * their own real NFL team's real opponent — not their fantasy matchup
 * opponent, and specific to their own position. Falls back to a neutral
 * middle-of-the-pack rank for a bye week, missing schedule data, or a
 * position with no games recorded yet this season (e.g. very early Week 1).
 */
export function realDefRankFor(
    team:            string | undefined,
    position:        string,
    opponentByTeam:  Record<string, string>,
    ranking:         DefenseRanking,
): { rank: number; total: number } {
    const total   = ranking.totalByPosition.get(position) || 32;
    const neutral = Math.max(1, Math.ceil(total / 2));
    const opponent = team ? opponentByTeam[team] : undefined;
    if (!opponent) return { rank: neutral, total };
    const rank = ranking.rankByTeamPosition.get(`${opponent}|${position}`);
    return { rank: rank ?? neutral, total };
}
