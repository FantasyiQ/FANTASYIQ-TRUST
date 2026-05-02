import { prisma } from '@/lib/prisma';
import {
    getEspnLeagueSettings,
    getEspnTeams,
    deriveEspnScoringType,
    deriveEspnStatus,
    buildEspnStandings,
} from '@/lib/espn';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Find all users with ESPN credentials who have ESPN leagues
        const users = await prisma.user.findMany({
            where: {
                espnS2: { not: null },
                swid:   { not: null },
                leagues: { some: { platform: 'espn' } },
            },
            select: {
                id: true,
                espnS2: true,
                swid: true,
                leagues: {
                    where:  { platform: 'espn' },
                    select: { id: true, leagueId: true, season: true },
                },
            },
        });

        let synced = 0;

        for (const user of users) {
            if (!user.espnS2 || !user.swid) continue;

            for (const league of user.leagues) {
                try {
                    const season = Number(league.season);
                    const [settings, teamsData] = await Promise.all([
                        getEspnLeagueSettings(league.leagueId, season, user.espnS2, user.swid),
                        getEspnTeams(league.leagueId, season, user.espnS2, user.swid),
                    ]);

                    const standings = buildEspnStandings(teamsData.teams ?? []);

                    await prisma.league.update({
                        where: { id: league.id },
                        data: {
                            status:       deriveEspnStatus(settings),
                            scoringType:  deriveEspnScoringType(settings.settings),
                            standings,
                            lastSyncedAt: new Date(),
                        },
                    });
                    synced++;
                } catch { /* skip this league, try next */ }
            }
        }

        return Response.json({ ok: true, synced, users: users.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'ESPN sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
