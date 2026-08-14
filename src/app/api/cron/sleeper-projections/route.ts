import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

// Sleeper's public projections endpoint — returns points for all players
// for a given NFL season + week.
// https://api.sleeper.app/v1/projections/nfl/{season}/{week}
//
// The response carries a full per-stat breakdown (pass_yd, rec, fgm_20_29,
// etc. — the same canonical key vocabulary Sleeper's real stats endpoint
// uses), not just the 3 pre-aggregated point totals below. That raw blob is
// stored as rawProjection so any league's real scoring_settings can compute
// a real projected score via the League Scoring Points Engine, instead of
// every league being stuck on a generic ppr/std/half_ppr bucket.

type SleeperProjection = {
    pts_ppr?:      number;
    pts_std?:      number;
    pts_half_ppr?: number;
    [stat: string]: number | undefined;
};

export async function GET(request: NextRequest): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Sleeper's own authoritative state, not a local date heuristic — the
        // previous getMonth()-based guess ("before September = still last
        // season") desynced from Sleeper's real calendar during the preseason
        // crossover, silently syncing a stale prior-season snapshot instead
        // of the real current week (confirmed live: Sleeper's API already had
        // rich real projections for the upcoming season's rookies while this
        // cron kept fetching a week that predated their NFL careers).
        const nflState = await getNflState();
        const season   = nflState.season;
        const week     = nflState.week > 0 ? nflState.week : 1;
    
        // Try the current week; fall back to week 1 if no projection data found
        let data: Record<string, SleeperProjection> = {};
        for (const tryWeek of [week, 1]) {
            const res = await fetch(
                `https://api.sleeper.app/v1/projections/nfl/regular/${season}/${tryWeek}`,
                { cache: 'no-store' }
            );
            if (!res.ok) continue;
            const raw = await res.json() as Record<string, SleeperProjection>;
            const hasData = Object.values(raw).some(p => p?.pts_ppr != null || p?.pts_std != null);
            if (hasData) { data = raw; break; }
        }
    
        const rows = Object.entries(data)
            .filter(([, p]) => p?.pts_ppr != null || p?.pts_std != null)
            .map(([playerId, p]) => ({
                playerId,
                season,
                week,
                pointsPpr:     p.pts_ppr      ?? 0,
                pointsStd:     p.pts_std      ?? 0,
                pointsHalfPpr: p.pts_half_ppr ?? 0,
                rawProjection: p,
            }));

        // Upsert in batches of 200
        const BATCH = 200;
        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH);
            await Promise.all(batch.map(r =>
                prisma.playerProjection.upsert({
                    where: { playerId_season_week: { playerId: r.playerId, season: r.season, week: r.week } },
                    create: r,
                    update: { pointsPpr: r.pointsPpr, pointsStd: r.pointsStd, pointsHalfPpr: r.pointsHalfPpr, rawProjection: r.rawProjection },
                }).catch(() => null) // skip if playerId doesn't exist in SleeperPlayer
            ));
        }
    
        return Response.json({ ok: true, season, week, upserted: rows.length });
    } catch (err) {
        captureError(err, { cron: 'sleeper-projections' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
