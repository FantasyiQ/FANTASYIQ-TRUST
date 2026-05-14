import { prisma } from '@/lib/prisma';

/**
 * GET /api/dfs/contests/[id]/leaderboard
 *
 * Returns all lineups for the contest sorted by totalPoints DESC,
 * with user display name.  Public — no auth required.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const { id } = await params;

    const contest = await prisma.dFSContest.findUnique({
        where:   { id },
        select:  { id: true, week: true, season: true, status: true },
    });
    if (!contest) return Response.json({ error: 'Not found' }, { status: 404 });

    const lineups = await prisma.dFSLineup.findMany({
        where:   { contestId: id },
        orderBy: { totalPoints: 'desc' },
        select:  {
            id: true, totalPoints: true, entriesJson: true, locked: true,
            user: { select: { id: true, name: true } },
        },
    });

    return Response.json({ contest, lineups });
}
