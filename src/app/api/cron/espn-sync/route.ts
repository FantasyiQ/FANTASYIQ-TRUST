import { prisma } from '@/lib/prisma';
import { getEspnFullSync, normalizeEspnLeague, deriveEspnStatus, deriveEspnScoringType } from '@/lib/espn';
import { shouldSkipLeague, withRetry, recordSyncFailure, recordSyncRecovered } from '@/lib/sync-recovery';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await prisma.user.findMany({
        where: {
            espnS2: { not: null },
            swid:   { not: null },
            leagues: { some: { platform: 'espn' } },
        },
        select: {
            id: true, espnS2: true, swid: true,
            leagues: {
                where:  { platform: 'espn' },
                select: { id: true, leagueId: true, season: true, syncStatus: true, syncErrorCount: true, syncLastErrorAt: true },
            },
        },
    });

    let synced  = 0;
    let skipped = 0;

    for (const user of users) {
        if (!user.espnS2 || !user.swid) continue;

        for (const league of user.leagues) {
            if (shouldSkipLeague(league)) { skipped++; continue; }

            try {
                await withRetry(async () => {
                    const season  = Number(league.season);
                    const rawData = await getEspnFullSync(league.leagueId, season, user.espnS2!, user.swid!);
                    const data    = normalizeEspnLeague(rawData, league.leagueId);

                    const currentWeekMatchups = data.matchups.filter(m => m.week === data.currentWeek);

                    await prisma.league.update({
                        where: { id: league.id },
                        data: {
                            status:      deriveEspnStatus(rawData),
                            scoringType: deriveEspnScoringType(rawData.settings),
                            standings:   data.teams.map(t => ({
                                teamId: t.teamId, name: t.name, abbrev: t.abbrev,
                                ownerId: t.ownerId, wins: t.wins, losses: t.losses,
                                ties: t.ties, fpts: t.pointsFor, fptsAgainst: t.pointsAgainst,
                                rosterSize: t.roster.length,
                                players: t.roster.map(p => ({ name: p.fullName, position: p.position })),
                            })),
                            currentMatchup: currentWeekMatchups.length > 0
                                ? JSON.parse(JSON.stringify({ week: data.currentWeek, matchups: currentWeekMatchups }))
                                : null,
                            lastSyncedAt: new Date(),
                        },
                    });
                });

                await recordSyncRecovered(league.id);
                synced++;
            } catch (err) {
                await recordSyncFailure({ userId: user.id, leagueDbId: league.id, platform: 'espn', err });
            }
        }
    }

    return Response.json({ ok: true, synced, skipped, users: users.length });
}
