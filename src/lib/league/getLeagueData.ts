import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeague, getLeagueUsers } from '@/lib/sleeper';
import { deriveChampWeek } from '@/lib/leaguePhase';

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

    // ── Auto-persist Sleeper playoff settings if DB is missing them ───────────
    // Sleeper leagues carry playoff_week_start in their settings.  On first load
    // (or if the initial sync pre-dated this field) the DB may still be null.
    // Rather than forcing the commissioner to manually save every time, we fetch
    // from Sleeper once and write the values so the card shows "Configured".
    if (league.platform !== 'espn' && (league.playoffWeekStart === null || league.champWeek === null)) {
        try {
            const sleeperLeague   = await getLeague(league.leagueId);
            const playoffWeekStart = sleeperLeague.settings?.playoff_week_start ?? null;
            const playoffTeams     = sleeperLeague.settings?.playoff_teams ?? 4;
            const roundType        = sleeperLeague.settings?.playoff_round_type ?? 0;
            const champWeek        = playoffWeekStart && playoffWeekStart > 0
                ? deriveChampWeek(playoffWeekStart, playoffTeams, roundType)
                : null;

            if (playoffWeekStart && champWeek) {
                await prisma.league.update({
                    where: { id: league.id },
                    data:  { playoffWeekStart, champWeek },
                });
                league.playoffWeekStart = playoffWeekStart;
                league.champWeek        = champWeek;
            }
        } catch { /* Sleeper unreachable — leave as null, card stays editable */ }
    }

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
