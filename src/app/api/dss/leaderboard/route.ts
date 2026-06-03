// GET /api/dss/leaderboard
// Returns top DSS users for the public leaderboard.
// No auth required — scores are public dynasty skill data.

import { prisma } from '@/lib/prisma';

export const revalidate = 86400; // cached for 24 hours, refreshed after nightly cron

const MIN_GAMES    = 4;
const MAX_RESULTS  = 500;
const STALE_HOURS  = 48;

function dssTier(score: number): string {
    if (score >= 85) return 'Elite';
    if (score >= 70) return 'Solid';
    if (score >= 50) return 'Average';
    return 'Developing';
}

export async function GET(): Promise<Response> {
    const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

    const rows = await prisma.dssScore.findMany({
        where: {
            totalGames:    { gte: MIN_GAMES },
            dynastyLeagues: { gte: 1 },
            computedAt:    { gte: cutoff },
        },
        orderBy: [
            { dss:           'desc' },
            { totalGames:    'desc' },
            { dynastyLeagues: 'desc' },
        ],
        take: MAX_RESULTS,
        select: {
            userId:         true,
            dss:            true,
            dynastyLeagues: true,
            totalGames:     true,
            user: {
                select: { name: true, image: true },
            },
        },
    });

    const leaderboard = rows.map((r, i) => ({
        rank:          i + 1,
        userId:        r.userId,
        displayName:   r.user.name ?? 'Anonymous',
        avatar:        r.user.image ?? null,
        dssScore:      r.dss,
        dssTier:       dssTier(r.dss),
        leagueCount:   r.dynastyLeagues,
        gamesSampled:  r.totalGames,
    }));

    return Response.json({ leaderboard, updatedAt: new Date().toISOString() });
}
