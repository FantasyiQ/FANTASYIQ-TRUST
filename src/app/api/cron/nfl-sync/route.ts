import { prisma } from '@/lib/prisma';
import { getNFLLeagues, deriveNFLStatus, deriveNFLScoringType, defaultNFLRosterPositions } from '@/lib/nfl';
import { shouldSkipLeague, withRetry, recordSyncFailure, recordSyncRecovered } from '@/lib/sync-recovery';
import { captureError } from '@/lib/sentry';
import { withCronLog } from '@/lib/cron-logger';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('nfl-sync', async () => {
            const users = await prisma.user.findMany({
                where: {
                    nflSid:  { not: null },
                    leagues: { some: { platform: 'nfl' } },
                },
                select: {
                    id: true, nflSid: true,
                    leagues: {
                        where:  { platform: 'nfl' },
                        select: { id: true, leagueId: true, syncStatus: true, syncErrorCount: true, syncLastErrorAt: true },
                    },
                },
            });

            let synced  = 0;
            let skipped = 0;

            for (const user of users) {
                if (!user.nflSid) continue;

                let nflLeagues;
                try {
                    nflLeagues = await getNFLLeagues(user.nflSid);
                } catch { continue; } // can't fetch league list — skip user entirely (stale sid, etc.)

                const nflMap = new Map(nflLeagues.map(l => [String(l.id), l]));

                for (const league of user.leagues) {
                    const nflLeague = nflMap.get(league.leagueId);
                    if (!nflLeague) continue;
                    if (shouldSkipLeague(league)) { skipped++; continue; }

                    try {
                        await withRetry(async () => {
                            await prisma.league.update({
                                where: { id: league.id },
                                data: {
                                    leagueName:      nflLeague.name,
                                    season:          String(nflLeague.season),
                                    status:          deriveNFLStatus(nflLeague),
                                    totalRosters:    nflLeague.numTeams ?? nflLeague.teamCount ?? 12,
                                    scoringType:     deriveNFLScoringType(nflLeague),
                                    rosterPositions: defaultNFLRosterPositions(),
                                    lastSyncedAt:    new Date(),
                                },
                            });
                        });

                        await recordSyncRecovered(league.id);
                        synced++;
                    } catch (err) {
                        await recordSyncFailure({ userId: user.id, leagueDbId: league.id, platform: 'nfl', err });
                    }
                }
            }

            return { processed: synced, message: `${synced} leagues synced · ${skipped} skipped · ${users.length} users` };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'nfl-sync' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
