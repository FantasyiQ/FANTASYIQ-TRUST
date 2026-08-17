import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import { toStatsPerGame } from './leagueScoringPoints';

export interface ProductionSignal {
    statsPerGame:   Record<string, number>;  // per-game stat rate dict — feed into computeRealPoints() with any scoring dict
    gamesPlayed:    number;                  // real games if fromProjection=false; a full-season proxy if fromProjection=true
    fromProjection: boolean;
}

// A real weekly projection is already a full-season-equivalent estimate of
// role/usage, not a small in-season sample that needs regression — matches
// PROJECTION_FULL_SAMPLE_PROXY as previously defined locally in realRedraftBoard.ts.
const PROJECTION_FULL_SAMPLE_PROXY = 17;

/**
 * Resolves the best available real per-game production signal for each
 * player, batched for a whole player pool. Returns raw per-game stat dicts
 * (not pre-computed point totals) so callers can run them through any real
 * league's scoring settings — same computeRealPoints() dot-product used
 * everywhere else. Priority:
 *   1. This season's real per-game stats, if any games have been played —
 *      the best possible signal.
 *   2. This season's real weekly projection — reflects this year's actual
 *      team/role/health context (a new team, a coaching change, a real
 *      injury) that a full-year-stale prior season can't capture. Used
 *      during the preseason window before this year's stats exist, or any
 *      time a specific player has none yet (new signings, etc.).
 *   3. Last season's real stats — final fallback only for players with
 *      neither of the above (e.g. a projection sync gap for an obscure
 *      player).
 *
 * Before this function existed, every consumer independently fell back
 * straight from "this season's stats" to "last season's stats," skipping
 * real projections entirely for anyone with prior-season data — meaning
 * every established player's rankings ran on a full year of stale results
 * during the entire preseason, even when a real, current-year projection
 * (already reflecting this year's team/situation) was available instead.
 */
export async function resolveProductionSignals(
    playerIds: string[],
): Promise<Map<string, ProductionSignal>> {
    if (playerIds.length === 0) return new Map();

    const nflState      = await getNflState();
    const currentSeason = nflState.season;
    const priorSeason   = String(Number(currentSeason) - 1);

    const result = new Map<string, ProductionSignal>();

    // 1. This season's real stats.
    const currentStats = await prisma.playerSeasonStats.findMany({
        where:  { season: currentSeason, playerId: { in: playerIds } },
        select: { playerId: true, gamesPlayed: true, rawStats: true },
    });
    for (const s of currentStats) {
        if (!s.gamesPlayed) continue;
        result.set(s.playerId, {
            statsPerGame: toStatsPerGame(s.rawStats as Record<string, number>, s.gamesPlayed),
            gamesPlayed:  s.gamesPlayed,
            fromProjection: false,
        });
    }

    // 2. This season's real projection, for anyone without real games yet.
    const afterStats = playerIds.filter(id => !result.has(id));
    if (afterStats.length > 0) {
        const projWeek = nflState.week > 0 ? nflState.week : 1;
        let projRows = await prisma.playerProjection.findMany({
            where:  { season: currentSeason, week: projWeek, playerId: { in: afterStats } },
            select: { playerId: true, rawProjection: true },
        });
        if (projRows.length === 0) {
            // Requested week has no data yet (sync timing) — use whatever
            // real projection week is actually available this season.
            const latest = await prisma.playerProjection.findFirst({
                where:   { season: currentSeason },
                orderBy: { week: 'desc' },
                select:  { week: true },
            });
            if (latest) {
                projRows = await prisma.playerProjection.findMany({
                    where:  { season: currentSeason, week: latest.week, playerId: { in: afterStats } },
                    select: { playerId: true, rawProjection: true },
                });
            }
        }
        for (const r of projRows) {
            // rawProjection is already a per-game rate dict (Sleeper's own
            // weekly projection shape), unlike PlayerSeasonStats.rawStats
            // which needs toStatsPerGame() to convert season totals down.
            // Null only for rows synced before this field existed — skip
            // rather than credit a real player with a fabricated 0-stat line.
            if (!r.rawProjection) continue;
            result.set(r.playerId, {
                statsPerGame: r.rawProjection as Record<string, number>,
                gamesPlayed:  PROJECTION_FULL_SAMPLE_PROXY,
                fromProjection: true,
            });
        }
    }

    // 3. Last season's real stats — final fallback.
    const afterProjections = playerIds.filter(id => !result.has(id));
    if (afterProjections.length > 0) {
        const priorStats = await prisma.playerSeasonStats.findMany({
            where:  { season: priorSeason, playerId: { in: afterProjections } },
            select: { playerId: true, gamesPlayed: true, rawStats: true },
        });
        for (const s of priorStats) {
            if (!s.gamesPlayed) continue;
            result.set(s.playerId, {
                statsPerGame: toStatsPerGame(s.rawStats as Record<string, number>, s.gamesPlayed),
                gamesPlayed:  s.gamesPlayed,
                fromProjection: false,
            });
        }
    }

    return result;
}
