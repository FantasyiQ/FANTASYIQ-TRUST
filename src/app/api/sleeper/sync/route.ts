import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSleeperLeagues, getNflState, deriveScoringType, type SleeperLeague } from '@/lib/sleeper';

// POST /api/sleeper/sync — upsert selected leagues + persist sleeperUserId
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as { sleeperUserId?: string; leagues?: SleeperLeague[] };
    if (!body.sleeperUserId || !Array.isArray(body.leagues) || body.leagues.length === 0) {
        return Response.json({ error: 'sleeperUserId and leagues[] are required' }, { status: 400 });
    }

    const { sleeperUserId, leagues } = body;

    try {
        const nflState = await getNflState();
        const userLeagues = await getSleeperLeagues(sleeperUserId, nflState.season);
        const validIds = new Set(userLeagues.map((l) => l.league_id));
        const toSync = leagues.filter((l) => validIds.has(l.league_id));
        if (toSync.length === 0) return Response.json({ error: 'No valid leagues to sync' }, { status: 400 });

        await Promise.all([
            // Persist sleeperUserId so cron can find this user
            prisma.user.update({ where: { id: userId }, data: { sleeperUserId } }),
            // Upsert each league
            ...toSync.map((league) =>
                prisma.league.upsert({
                    where: { userId_platform_leagueId: { userId, platform: 'sleeper', leagueId: league.league_id } },
                    create: {
                        userId,
                        platform: 'sleeper',
                        leagueId: league.league_id,
                        leagueName: league.name,
                        season: league.season,
                        status: league.status,
                        totalRosters: league.total_rosters,
                        scoringType: deriveScoringType(league),
                        avatar: league.avatar,
                        rosterPositions: league.roster_positions,
                        lastSyncedAt: new Date(),
                    },
                    update: {
                        leagueName: league.name,
                        season: league.season,
                        status: league.status,
                        totalRosters: league.total_rosters,
                        scoringType: deriveScoringType(league),
                        avatar: league.avatar,
                        rosterPositions: league.roster_positions,
                        lastSyncedAt: new Date(),
                    },
                })
            ),
        ]);

        return Response.json({ synced: toSync.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}

// DELETE /api/sleeper/sync?leagueId=xxx
export async function DELETE(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const leagueId = request.nextUrl.searchParams.get('leagueId');
    if (!leagueId) return Response.json({ error: 'leagueId is required' }, { status: 400 });

    try {
        await prisma.league.delete({
            where: { userId_platform_leagueId: { userId, platform: 'sleeper', leagueId } },
        });
        return Response.json({ deleted: true });
    } catch {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }
}
