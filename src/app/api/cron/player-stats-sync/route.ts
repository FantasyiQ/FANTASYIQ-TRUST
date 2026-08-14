// GET /api/cron/player-stats-sync
// Syncs real per-player-season stat totals for skill positions (QB/RB/WR/TE)
// from Sleeper's stats API into PlayerSeasonStats. This is the data foundation
// for the League Scoring Points Engine: storing the full raw stat blob (not a
// curated subset) means computing a player's real fantasy points under ANY
// league's exact scoring_settings is just sum(scoringSettings[k] * rawStats[k]),
// no per-rule code required for new scoring quirks (rush attempts, first-down
// bonuses, TD-distance bonuses, 200-yard game bonuses, etc — see fetchSeasonStats
// callers in sleeperStatsAdapter.ts, which already proves Sleeper's raw payload
// includes these for IDP/K/DEF; this cron picks them apart for offense too).

import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';
import { withCronLog } from '@/lib/cron-logger';
import { getNflState } from '@/lib/sleeper';
import { fetchSeasonStats } from '@/lib/rankings/sleeperStatsAdapter';

export const maxDuration = 300;

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('player-stats-sync', async () => {
            const nflState = await getNflState();
            const season    = nflState.season;

            const statsMap = await fetchSeasonStats(season);
            if (!statsMap) {
                return { processed: 0, errors: 1, message: 'Sleeper stats fetch failed' };
            }

            const skillPlayers = await prisma.sleeperPlayer.findMany({
                where:  { position: { in: [...SKILL_POSITIONS] } },
                select: { playerId: true },
            });
            const skillIds = new Set(skillPlayers.map(p => p.playerId));

            const rows = Object.entries(statsMap)
                .filter(([playerId, stats]) => skillIds.has(playerId) && (stats.gp ?? 0) > 0)
                .map(([playerId, stats]) => ({
                    playerId,
                    season,
                    gamesPlayed: Math.round(stats.gp),
                    rawStats:    stats,
                }));

            const BATCH = 500;
            for (let i = 0; i < rows.length; i += BATCH) {
                const batch = rows.slice(i, i + BATCH);
                await Promise.all(batch.map(r => prisma.playerSeasonStats.upsert({
                    where:  { playerId_season: { playerId: r.playerId, season: r.season } },
                    create: r,
                    update: { gamesPlayed: r.gamesPlayed, rawStats: r.rawStats },
                }).catch(() => null)));
            }

            return { processed: rows.length, errors: 0, message: `season ${season}` };
        });

        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'player-stats-sync' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
