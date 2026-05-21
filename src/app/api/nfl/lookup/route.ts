// GET /api/nfl/lookup — return authenticated user's NFL fantasy leagues
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getNFLLeagues,
    deriveNFLStatus,
    deriveNFLScoringType,
    type NFLLeagueNormalized,
} from '@/lib/nfl';

export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { nflSid: true },
    });

    if (!user?.nflSid) {
        return Response.json({ error: 'NFL not connected' }, { status: 401 });
    }

    try {
        const leagues = await getNFLLeagues(user.nflSid);

        // Which leagues has this user already synced?
        const synced = await prisma.league.findMany({
            where:  { userId, platform: 'nfl' },
            select: { leagueId: true },
        });
        const syncedIds = new Set(synced.map(l => l.leagueId));

        const results: NFLLeagueNormalized[] = leagues.map(l => ({
            leagueId:     String(l.id),
            name:         l.name,
            season:       String(l.season),
            numTeams:     l.numTeams ?? l.teamCount ?? 12,
            scoringType:  deriveNFLScoringType(l),
            status:       deriveNFLStatus(l),
            alreadySynced: syncedIds.has(String(l.id)),
        }));

        return Response.json({ leagues: results });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Lookup failed';
        const status  = message.includes('401') || message.includes('not connected') ? 401 : 500;
        return Response.json({ error: message }, { status });
    }
}
