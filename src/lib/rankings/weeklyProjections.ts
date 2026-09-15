// Shared weekly-projection builder for the FantasyIQ Hub (Optimized Lineup,
// Waiver Targets, Trade Insights, Roster Intelligence) — platform-agnostic
// once callers have resolved their roster to canonical Sleeper playerIds.
// Used by both the Sleeper branch and the ESPN branch of the Hub page.

import { prisma } from '@/lib/prisma';
import { getWeekRealStats } from '@/lib/sleeper';
import { computeRealProjectedPoints, computeRealPoints, blendIdpProjectionWithRecentStats } from './leagueScoringPoints';
import { toIdpPosition } from './seedProjections';
import type { PlayerRecord } from '../projection-engine';

export interface WeeklyProjectionResult {
    projByPlayer: Map<string, number>;
    playerInfo:   Map<string, PlayerRecord>;
}

/**
 * Builds baseProj-per-player and player metadata for one week, for a given
 * set of rostered player IDs:
 *   1. Real projections from PlayerProjection where they exist.
 *   2. A rostered player missing a projection row falls back to their real
 *      output from the most recently completed week, instead of baseProj=0
 *      (worse than any projected scrub, even after a huge real week).
 *   3. IDP-only: blends in up to 3 trailing weeks of real production even
 *      when a projection already exists — Sleeper's DL/LB/DB projections
 *      are shallow and slow to reflect real role changes.
 * playerInfo covers every rostered player, not just projected ones, so a
 * missing projection can never silently erase a real player (position
 * 'UNK') from lineup optimization.
 */
export async function buildWeeklyProjections(params: {
    season:            string;
    week:              number;
    scoringSettings:   Record<string, number> | null;
    scoringType:       string | null;
    rosteredPlayerIds: Set<string>;
}): Promise<WeeklyProjectionResult> {
    const { season, week, scoringSettings, scoringType, rosteredPlayerIds } = params;

    const allProjections = await prisma.playerProjection.findMany({
        where:  { season, week },
        select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true, rawProjection: true },
    });
    const allProjectedIds = allProjections.map(p => p.playerId);

    const knownPlayerIds = [...new Set([...rosteredPlayerIds, ...allProjectedIds])];
    const allPlayers = await prisma.sleeperPlayer.findMany({
        where:  { playerId: { in: knownPlayerIds } },
        select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
    });

    const projByPlayer = new Map(allProjections.map(p => [
        p.playerId,
        computeRealProjectedPoints(
            p.rawProjection as Record<string, number> | null,
            scoringSettings,
            p,
            scoringType,
        ),
    ]));

    const unprojectedRosteredIds = [...rosteredPlayerIds].filter(pid => !projByPlayer.has(pid));
    const trailingStatsByWeek = new Map<number, Record<string, Record<string, number>>>();
    if (unprojectedRosteredIds.length > 0 && week > 1 && scoringSettings) {
        const priorWeekStats = await getWeekRealStats(season, week - 1);
        trailingStatsByWeek.set(week - 1, priorWeekStats);
        for (const pid of unprojectedRosteredIds) {
            const stats = priorWeekStats[pid];
            if (stats) projByPlayer.set(pid, computeRealPoints(stats, scoringSettings));
        }
    }

    // IDP-only blend — even when a projection already exists.
    if (week > 1 && scoringSettings) {
        const positionById = new Map(allPlayers.map(p => [p.playerId, p.position]));
        const idpTargetIds = [...projByPlayer.keys()].filter(
            pid => toIdpPosition(positionById.get(pid) ?? '') !== null
        );
        if (idpTargetIds.length > 0) {
            const TRAILING_WEEKS = 3;
            const weeksNeeded = Array.from(
                { length: Math.min(TRAILING_WEEKS, week - 1) },
                (_, i) => week - 1 - i,
            );
            await Promise.all(
                weeksNeeded
                    .filter(w => !trailingStatsByWeek.has(w))
                    .map(async w => trailingStatsByWeek.set(w, await getWeekRealStats(season, w))),
            );
            for (const pid of idpTargetIds) {
                const trailingStats = weeksNeeded
                    .map(w => trailingStatsByWeek.get(w)?.[pid])
                    .filter((s): s is Record<string, number> => !!s);
                if (trailingStats.length === 0) continue;
                const currentProj = projByPlayer.get(pid) ?? 0;
                projByPlayer.set(
                    pid,
                    blendIdpProjectionWithRecentStats(currentProj, trailingStats, scoringSettings),
                );
            }
        }
    }

    const playerInfo = new Map<string, PlayerRecord>(
        allPlayers.map(p => [p.playerId, {
            playerId:     p.playerId,
            name:         p.fullName,
            position:     p.position,
            team:         p.team,
            injuryStatus: p.injuryStatus,
        }])
    );

    return { projByPlayer, playerInfo };
}
