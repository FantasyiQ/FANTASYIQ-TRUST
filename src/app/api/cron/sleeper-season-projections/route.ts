// GET /api/cron/sleeper-season-projections
// Syncs real full-season fantasy projections for skill positions
// (QB/RB/WR/TE) from Sleeper's season-long projections API into
// PlayerSeasonProjection. Same shape and same purpose as player-stats-sync,
// just for projected totals instead of actual ones: storing the full raw
// per-stat blob (not pre-aggregated points) means computing a player's real
// projected fantasy points under ANY league's exact scoring_settings is
// just sum(scoringSettings[k] * rawStats[k]) via computeRealPoints(), the
// same League Scoring Points Engine dot-product used everywhere else.
//
// This is deliberately the SEASON-long endpoint (no week param), not the
// per-week one /api/cron/sleeper-projections already syncs — a single
// week's projection is exposed to normal week-to-week noise (a short-term
// injury designation, a bye week, a preseason-adjacent placeholder before
// the real season has started) that a season total isn't. Real weekly
// projections still matter for their own purpose (Start/Sit, DFS, weekly
// Projections pages) and are left untouched; this is specifically the
// signal used to answer "how good is this player expected to be this
// year," not "how many points will they score in week N."

import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';
import { withCronLog } from '@/lib/cron-logger';
import { getNflState } from '@/lib/sleeper';

export const maxDuration = 300;

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

type SleeperSeasonProjection = {
    gp?: number;
    [stat: string]: number | undefined;
};

const SLEEPER_SEASON_PROJECTIONS_URL = (season: string) =>
    `https://api.sleeper.app/v1/projections/nfl/regular/${season}`;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('sleeper-season-projections', async () => {
            const nflState = await getNflState();
            const season    = nflState.season;

            const res = await fetch(SLEEPER_SEASON_PROJECTIONS_URL(season), { cache: 'no-store' });
            if (!res.ok) {
                return { processed: 0, errors: 1, message: `Sleeper season projections fetch failed (${res.status})` };
            }
            const projMap = await res.json() as Record<string, SleeperSeasonProjection>;

            const skillPlayers = await prisma.sleeperPlayer.findMany({
                where:  { position: { in: [...SKILL_POSITIONS] } },
                select: { playerId: true },
            });
            const skillIds = new Set(skillPlayers.map(p => p.playerId));

            const rows = Object.entries(projMap)
                .filter(([playerId, proj]) => skillIds.has(playerId) && (proj.gp ?? 0) > 0)
                .map(([playerId, proj]) => ({
                    playerId,
                    season,
                    gamesPlayed: Math.round(proj.gp!),
                    rawStats:    proj,
                }));

            const BATCH = 500;
            for (let i = 0; i < rows.length; i += BATCH) {
                const batch = rows.slice(i, i + BATCH);
                await Promise.all(batch.map(r => prisma.playerSeasonProjection.upsert({
                    where:  { playerId_season: { playerId: r.playerId, season: r.season } },
                    create: r,
                    update: { gamesPlayed: r.gamesPlayed, rawStats: r.rawStats },
                }).catch(() => null)));
            }

            // A real day should always return data for hundreds of skill
            // players — zero rows almost always means Sleeper's response
            // shape changed or the endpoint had an outage, not that there's
            // genuinely nothing to sync.
            return {
                processed: rows.length,
                errors:    rows.length === 0 ? 1 : 0,
                message:   `season ${season} — ${rows.length} season projections upserted`,
            };
        });

        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'sleeper-season-projections' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
