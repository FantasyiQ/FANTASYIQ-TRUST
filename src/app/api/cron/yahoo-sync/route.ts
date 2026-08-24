import { prisma } from '@/lib/prisma';
import { getYahooLeagues, refreshYahooToken, deriveYahooStatus, deriveYahooScoringType, defaultYahooRosterPositions } from '@/lib/yahoo';
import { shouldSkipLeague, withRetry, recordSyncFailure, recordSyncRecovered } from '@/lib/sync-recovery';
import { captureError } from '@/lib/sentry';
import { withCronLog } from '@/lib/cron-logger';

export const maxDuration = 300;

async function getValidAccessToken(user: {
    id:                  string;
    yahooAccessToken:    string | null;
    yahooRefreshToken:   string | null;
    yahooTokenExpiresAt: Date | null;
}): Promise<string | null> {
    if (!user.yahooAccessToken || !user.yahooRefreshToken) return null;

    const expiresAt = user.yahooTokenExpiresAt?.getTime() ?? 0;
    if (Date.now() < expiresAt - 60_000) return user.yahooAccessToken;

    const fresh     = await refreshYahooToken(user.yahooRefreshToken);
    const newExpiry = new Date(Date.now() + fresh.expires_in * 1000);
    await prisma.user.update({
        where: { id: user.id },
        data:  {
            yahooAccessToken:    fresh.access_token,
            yahooRefreshToken:   fresh.refresh_token,
            yahooTokenExpiresAt: newExpiry,
        },
    });
    return fresh.access_token;
}

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('yahoo-sync', async () => {
            const users = await prisma.user.findMany({
                where: {
                    yahooAccessToken:  { not: null },
                    yahooRefreshToken: { not: null },
                    leagues:           { some: { platform: 'yahoo' } },
                },
                select: {
                    id: true, yahooAccessToken: true, yahooRefreshToken: true, yahooTokenExpiresAt: true,
                    leagues: {
                        where:  { platform: 'yahoo' },
                        select: { id: true, leagueId: true, syncStatus: true, syncErrorCount: true, syncLastErrorAt: true },
                    },
                },
            });

            let synced  = 0;
            let skipped = 0;

            for (const user of users) {
                let accessToken;
                try {
                    accessToken = await getValidAccessToken(user);
                } catch { continue; } // refresh token revoked/expired — skip user entirely
                if (!accessToken) continue;

                let yahooLeagues;
                try {
                    yahooLeagues = await getYahooLeagues(accessToken);
                } catch { continue; }

                const yahooMap = new Map(yahooLeagues.map(l => [l.leagueKey, l]));

                for (const league of user.leagues) {
                    const yahooLeague = yahooMap.get(league.leagueId);
                    if (!yahooLeague) continue;
                    if (shouldSkipLeague(league)) { skipped++; continue; }

                    try {
                        await withRetry(async () => {
                            await prisma.league.update({
                                where: { id: league.id },
                                data: {
                                    leagueName:      yahooLeague.name,
                                    season:          yahooLeague.season,
                                    status:          deriveYahooStatus(yahooLeague),
                                    totalRosters:    yahooLeague.numTeams,
                                    scoringType:     deriveYahooScoringType(yahooLeague),
                                    rosterPositions: defaultYahooRosterPositions(yahooLeague),
                                    lastSyncedAt:    new Date(),
                                },
                            });
                        });

                        await recordSyncRecovered(league.id);
                        synced++;
                    } catch (err) {
                        await recordSyncFailure({ userId: user.id, leagueDbId: league.id, platform: 'yahoo', err });
                    }
                }
            }

            return { processed: synced, message: `${synced} leagues synced · ${skipped} skipped · ${users.length} users` };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'yahoo-sync' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
