import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueUsers } from '@/lib/sleeper';

export type LeagueData = {
    league: {
        id:               string;
        leagueName:       string;
        season:           string;
        leagueId:         string;
        platform:         'sleeper';
        is_owner:         boolean;
        playoffWeekStart: number | null;
        champWeek:        number | null;
    };
    dues: { id: string } | null;
};

export async function getLeagueData(id: string): Promise<LeagueData> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: { id: true, userId: true, leagueId: true, leagueName: true, season: true, sleeperUserId: true, platform: true, playoffWeekStart: true, champWeek: true },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { sleeperUserId: true },
        }),
    ]);

    if (!league || league.userId !== session.user.id) notFound();

    // Commissioner check: ESPN leagues use DB ownership; Sleeper uses API
    let is_owner = false;
    if (league.platform === 'espn') {
        is_owner = league.userId === session.user.id;
    } else {
        const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
        try {
            const members = await getLeagueUsers(league.leagueId);
            const commId  = members.find(m => m.is_owner)?.user_id;
            is_owner = !!commId && !!mySleeperUserId &&
                String(commId).trim() === String(mySleeperUserId).trim();
        } catch { /* Sleeper unreachable */ }
    }

    const dues = await prisma.leagueDues.findFirst({
        where:  { leagueName: { equals: league.leagueName, mode: 'insensitive' }, season: league.season },
        select: { id: true },
    });

    return {
        league: {
            id:               league.id,
            leagueName:       league.leagueName,
            season:           league.season,
            leagueId:         league.leagueId,
            platform:         'sleeper',
            is_owner,
            playoffWeekStart: league.playoffWeekStart ?? null,
            champWeek:        league.champWeek        ?? null,
        },
        dues: dues ?? null,
    };
}
