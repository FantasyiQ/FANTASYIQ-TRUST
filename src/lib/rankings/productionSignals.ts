import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import { toStatsPerGame } from './leagueScoringPoints';

export interface ProductionSignal {
    statsPerGame:   Record<string, number>;  // per-game stat rate dict — feed into computeRealPoints() with any scoring dict
    gamesPlayed:    number;                  // real games if fromProjection=false; Sleeper's own projected games-played if fromProjection=true
    fromProjection: boolean;
}

/**
 * Resolves the best available real per-game production signal for each
 * player, batched for a whole player pool. Returns raw per-game stat dicts
 * (not pre-computed point totals) so callers can run them through any real
 * league's scoring settings — same computeRealPoints() dot-product used
 * everywhere else. Priority:
 *   1. This season's real per-game stats, if any games have been played —
 *      the best possible signal.
 *   2. This season's real FULL-SEASON projection (PlayerSeasonProjection) —
 *      reflects this year's actual team/role/health context (a new team, a
 *      coaching change, a real injury) that a full-year-stale prior season
 *      can't capture. Deliberately the season-long total, not a single
 *      week's projection: one week is exposed to normal week-to-week noise
 *      (a short-term injury designation, a preseason-adjacent placeholder
 *      before the real season starts) that a season total isn't — verified
 *      live, a real elite starter's single-week projection collapsed to a
 *      fraction of his real season total for exactly this reason. Used
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

    // 2. This season's real full-season projection, for anyone without real
    // games yet.
    const afterStats = playerIds.filter(id => !result.has(id));
    if (afterStats.length > 0) {
        const seasonProjRows = await prisma.playerSeasonProjection.findMany({
            where:  { season: currentSeason, playerId: { in: afterStats } },
            select: { playerId: true, gamesPlayed: true, rawStats: true },
        });
        for (const r of seasonProjRows) {
            if (!r.gamesPlayed) continue;
            result.set(r.playerId, {
                statsPerGame: toStatsPerGame(r.rawStats as Record<string, number>, r.gamesPlayed),
                gamesPlayed:  r.gamesPlayed,
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
