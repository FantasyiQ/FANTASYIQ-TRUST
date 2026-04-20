import { prisma } from '@/lib/prisma';
import { getSleeperLeagues, getLeagueRosters, getNflState, deriveScoringType, rosterFpts } from '@/lib/sleeper';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [users, nflState] = await Promise.all([
            prisma.user.findMany({
                where: { sleeperUserId: { not: null } },
                select: { id: true, sleeperUserId: true, leagues: { select: { id: true, leagueId: true } } },
            }),
            getNflState(),
        ]);

        let synced = 0;

        for (const user of users) {
            if (!user.sleeperUserId) continue;

            try {
                // Refresh league list in case user joined new leagues
                const sleeperLeagues = await getSleeperLeagues(user.sleeperUserId, nflState.season);
                const sleeperMap = new Map(sleeperLeagues.map((l) => [l.league_id, l]));

                for (const dbLeague of user.leagues) {
                    const sleeperLeague = sleeperMap.get(dbLeague.leagueId);
                    if (!sleeperLeague) continue;

                    try {
                        const rosters = await getLeagueRosters(dbLeague.leagueId);
                        const standings = rosters.map((r) => ({
                            rosterId:  r.roster_id,
                            ownerId:   r.owner_id,
                            wins:      r.settings?.wins ?? 0,
                            losses:    r.settings?.losses ?? 0,
                            ties:      r.settings?.ties ?? 0,
                            fpts:      rosterFpts(r.settings),
                        })).sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);

                        await prisma.league.update({
                            where: { id: dbLeague.id },
                            data: {
                                status:          sleeperLeague.status,
                                scoringType:     deriveScoringType(sleeperLeague),
                                leagueType:      sleeperLeague.settings?.type === 2 ? 'Dynasty' : 'Redraft',
                                scoringSettings: sleeperLeague.scoring_settings ?? {},
                                standings,
                                lastSyncedAt: new Date(),
                            },
                        });
                        synced++;
                    } catch { /* skip this league, try next */ }
                }
            } catch { /* skip this user, try next */ }
        }

        return Response.json({ ok: true, synced, users: users.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
