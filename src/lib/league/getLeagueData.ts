import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueUsers } from '@/lib/sleeper';

export type LeagueData = {
    league: {
        id:         string;
        leagueName: string;
        season:     string;
        leagueId:   string;
        platform:   'sleeper';
        is_owner:   boolean;
    };
    dues:           { id: string } | null;
    proBowlContest: { id: string; name: string } | null;
};

export async function getLeagueData(id: string): Promise<LeagueData> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: { id: true, userId: true, leagueId: true, leagueName: true, season: true, sleeperUserId: true },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { sleeperUserId: true },
        }),
    ]);

    if (!league || league.userId !== session.user.id) notFound();

    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;

    // Commissioner check via Sleeper
    let is_owner = false;
    try {
        const members = await getLeagueUsers(league.leagueId);
        const commId  = members.find(m => m.is_owner)?.user_id;
        is_owner = !!commId && !!mySleeperUserId &&
            String(commId).trim() === String(mySleeperUserId).trim();
    } catch { /* Sleeper unreachable */ }

    const [dues, proBowlContest] = await Promise.all([
        prisma.leagueDues.findFirst({
            where:  { leagueName: { equals: league.leagueName, mode: 'insensitive' }, season: league.season },
            select: { id: true },
        }),
        prisma.proBowlContest.findFirst({
            where:   { leagueId: league.id, isActive: true },
            select:  { id: true, name: true },
            orderBy: { createdAt: 'desc' },
        }),
    ]);

    return {
        league: {
            id:         league.id,
            leagueName: league.leagueName,
            season:     league.season,
            leagueId:   league.leagueId,
            platform:   'sleeper',
            is_owner,
        },
        dues:           dues ?? null,
        proBowlContest: proBowlContest ?? null,
    };
}
