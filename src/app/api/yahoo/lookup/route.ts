// GET /api/yahoo/lookup — return authenticated user's Yahoo NFL leagues
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getYahooLeagues,
    refreshYahooToken,
    deriveYahooStatus,
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

    // Refresh if expired or within 60 s of expiry
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

export interface YahooLeagueLookupResult {
    leagueKey:   string;
    name:        string;
    season:      string;
    numTeams:    number;
    draftStatus: string;
    status:      string;
    currentWeek: number | null;
    isPublic:    boolean;
    alreadySynced: boolean;
}

export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    try {
        const accessToken = await getValidAccessToken(userId);
        const leagues     = await getYahooLeagues(accessToken);

        // Which leagues has this user already synced?
        const synced = await prisma.league.findMany({
            where:  { userId, platform: 'yahoo' },
            select: { leagueId: true },
        });
        const syncedKeys = new Set(synced.map(l => l.leagueId));

        const results: YahooLeagueLookupResult[] = leagues.map((l: YahooLeague) => ({
            leagueKey:     l.leagueKey,
            name:          l.name,
            season:        l.season,
            numTeams:      l.numTeams,
            draftStatus:   l.draftStatus,
            status:        deriveYahooStatus(l),
            currentWeek:   l.currentWeek,
            isPublic:      l.isPublic,
            alreadySynced: syncedKeys.has(l.leagueKey),
        }));

        return Response.json({ leagues: results });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Lookup failed';
        const status  = message.includes('not connected') ? 401 : 500;
        return Response.json({ error: message }, { status });
    }
}
