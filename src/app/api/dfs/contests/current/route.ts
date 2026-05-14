import type { NextRequest } from 'next/server';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { currentNflWeek, getDFSSlots } from '@/lib/dfs';

/**
 * GET /api/dfs/contests/current?leagueId=<League.id>
 *
 * Returns (creating if needed) the current week's DFSContest for the
 * external league that owns the given League record.
 *
 * Response:
 *   { contest, dfsSlots, userLineup | null }
 */
export async function GET(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const leagueId = request.nextUrl.searchParams.get('leagueId');
    if (!leagueId) return Response.json({ error: 'leagueId required' }, { status: 400 });

    // Verify the requesting user owns this League record
    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: {
            id: true, userId: true, platform: true, leagueId: true,
            season: true, rosterPositions: true, scoringType: true,
        },
    });

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const { week, season } = currentNflWeek();
    // Respect the league's own season (e.g. "2025") rather than derived year
    const contestSeason = parseInt(league.season, 10) || season;

    // Find or create the shared contest for this external league
    let contest = await prisma.dFSContest.findUnique({
        where: {
            platform_externalLeagueId_season_week: {
                platform:         league.platform,
                externalLeagueId: league.leagueId,
                season:           contestSeason,
                week,
            },
        },
    });

    if (!contest) {
        contest = await prisma.dFSContest.create({
            data: {
                platform:         league.platform,
                externalLeagueId: league.leagueId,
                sourceLeagueId:   league.id,
                season:           contestSeason,
                week,
                status:           'OPEN',
            },
        });
    }

    const userLineup = await prisma.dFSLineup.findUnique({
        where: { contestId_userId: { contestId: contest.id, userId: session.user.id } },
        select: { id: true, entriesJson: true, totalPoints: true, locked: true },
    });

    const dfsSlots = getDFSSlots(league.rosterPositions as string[]);

    return Response.json({ contest, dfsSlots, userLineup });
}
