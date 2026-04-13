import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

// Sleeper's public projections endpoint — returns points for all players
// for a given NFL season + week.
// https://api.sleeper.app/v1/projections/nfl/{season}/{week}

type SleeperProjection = {
    pts_ppr?:      number;
    pts_std?:      number;
    pts_half_ppr?: number;
};

function currentNflWeek(): { season: string; week: number } {
    // NFL season runs Sep–Jan; use current year or prior year if before Sep
    const now = new Date();
    const season = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    // Rough week estimate: season starts first Thursday of September
    // For off-season just return week 1 of the coming season
    const sepStart = new Date(season, 8, 1);
    const firstThursday = new Date(sepStart);
    firstThursday.setDate(sepStart.getDate() + ((4 - sepStart.getDay() + 7) % 7));
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const week = Math.max(1, Math.min(18, Math.floor((now.getTime() - firstThursday.getTime()) / msPerWeek) + 1));
    return { season: String(season), week };
}

export async function GET(request: NextRequest): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { season, week } = currentNflWeek();

    const res = await fetch(
        `https://api.sleeper.app/v1/projections/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`,
        { cache: 'no-store' }
    );
    if (!res.ok) return Response.json({ error: `Sleeper ${res.status}` }, { status: 502 });

    const data = await res.json() as Record<string, SleeperProjection>;

    const rows = Object.entries(data)
        .filter(([, p]) => p.pts_ppr != null || p.pts_std != null)
        .map(([playerId, p]) => ({
            playerId,
            season,
            week,
            pointsPpr:     p.pts_ppr      ?? 0,
            pointsStd:     p.pts_std      ?? 0,
            pointsHalfPpr: p.pts_half_ppr ?? 0,
        }));

    // Upsert in batches of 200
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await Promise.all(batch.map(r =>
            prisma.playerProjection.upsert({
                where: { playerId_season_week: { playerId: r.playerId, season: r.season, week: r.week } },
                create: r,
                update: { pointsPpr: r.pointsPpr, pointsStd: r.pointsStd, pointsHalfPpr: r.pointsHalfPpr },
            }).catch(() => null) // skip if playerId doesn't exist in SleeperPlayer
        ));
    }

    return Response.json({ ok: true, season, week, upserted: rows.length });
}
