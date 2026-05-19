// POST /api/yahoo/sync   — upsert selected Yahoo leagues
// DELETE /api/yahoo/sync — remove a Yahoo league
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { trackFeature } from '@/app/actions/analytics';
import {
    getYahooLeagues,
    refreshYahooToken,
    deriveYahooStatus,
    deriveYahooScoringType,
    defaultYahooRosterPositions,
    type YahooLeague,
} from '@/lib/yahoo';

async function getValidAccessToken(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: {
            yahooAccessToken:    true,
            yahooRefreshToken:   true,
            yahooTokenExpiresAt: true,
        },
    });

    if (!user?.yahooAccessToken || !user?.yahooRefreshToken) {
        throw new Error('Yahoo not connected');
    }

    const expiresAt = user.yahooTokenExpiresAt?.getTime() ?? 0;
    if (Date.now() >= expiresAt - 60_000) {
        const fresh     = await refreshYahooToken(user.yahooRefreshToken);
        const newExpiry = new Date(Date.now() + fresh.expires_in * 1000);
        await prisma.user.update({
            where: { id: userId },
            data:  {
                yahooAccessToken:    fresh.access_token,
                yahooRefreshToken:   fresh.refresh_token,
                yahooTokenExpiresAt: newExpiry,
            },
        });
        return fresh.access_token;
    }

    return user.yahooAccessToken;
}

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as { leagueKeys?: string[] };
    if (!Array.isArray(body.leagueKeys) || body.leagueKeys.length === 0) {
        return Response.json({ error: 'leagueKeys[] is required' }, { status: 400 });
    }

    try {
        const accessToken    = await getValidAccessToken(userId);
        const allLeagues     = await getYahooLeagues(accessToken);
        const keySet         = new Set(body.leagueKeys);
        const toSync         = allLeagues.filter((l: YahooLeague) => keySet.has(l.leagueKey));

        if (toSync.length === 0) {
            return Response.json({ error: 'None of the requested leagues were found' }, { status: 400 });
        }

        const results = await Promise.all(
            toSync.map(async (league: YahooLeague) => {
                const leagueRecord = {
                    leagueName:      league.name,
                    season:          league.season,
                    status:          deriveYahooStatus(league),
                    totalRosters:    league.numTeams,
                    scoringType:     deriveYahooScoringType(league),
                    rosterPositions: defaultYahooRosterPositions(league),
                    lastSyncedAt:    new Date(),
                };

                return prisma.league.upsert({
                    where:  { userId_platform_leagueId: { userId, platform: 'yahoo', leagueId: league.leagueKey } },
                    create: { userId, platform: 'yahoo', leagueId: league.leagueKey, ...leagueRecord },
                    update: leagueRecord,
                    select: { id: true, leagueId: true, leagueName: true },
                });
            }),
        );

        void trackFeature('yahoo_sync', { count: results.length });

        return Response.json({
            synced:    results.length,
            leagues:   results,
            redirectTo: results.length === 1 ? `/dashboard/league/${results[0].id}` : '/dashboard',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        const status  = message.includes('not connected') ? 401 : 500;
        return Response.json({ error: message }, { status });
    }
}

export async function DELETE(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const leagueId = request.nextUrl.searchParams.get('leagueId');
    if (!leagueId) return Response.json({ error: 'leagueId is required' }, { status: 400 });

    try {
        await prisma.league.delete({
            where: { userId_platform_leagueId: { userId, platform: 'yahoo', leagueId } },
        });
        return Response.json({ deleted: true });
    } catch {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }
}
