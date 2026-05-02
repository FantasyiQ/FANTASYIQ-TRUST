import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getEspnLeagueSettings,
    getEspnTeams,
    deriveEspnScoringType,
    deriveEspnStatus,
    buildEspnStandings,
} from '@/lib/espn';

// PATCH /api/espn/credentials — update stored ESPN cookies and re-sync a league
export async function PATCH(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as { leagueDbId?: string; espnS2?: string; swid?: string };
    const leagueDbId = body.leagueDbId?.replace(/\s/g, '');
    const espnS2     = body.espnS2?.replace(/\s/g, '');
    const swid       = body.swid?.replace(/\s/g, '');

    if (!leagueDbId || !espnS2 || !swid) {
        return Response.json({ error: 'leagueDbId, espnS2, and swid are required' }, { status: 400 });
    }

    // Verify this league belongs to the user and is an ESPN league
    const league = await prisma.league.findUnique({
        where:  { id: leagueDbId },
        select: { userId: true, platform: true, leagueId: true, season: true },
    });

    if (!league || league.userId !== userId) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }
    if (league.platform !== 'espn') {
        return Response.json({ error: 'Not an ESPN league' }, { status: 400 });
    }

    try {
        const season = Number(league.season);
        const [settings, teamsData] = await Promise.all([
            getEspnLeagueSettings(league.leagueId, season, espnS2, swid),
            getEspnTeams(league.leagueId, season, espnS2, swid),
        ]);

        const standings = buildEspnStandings(teamsData.teams ?? []);

        await Promise.all([
            // Update stored credentials on the user
            prisma.user.update({
                where: { id: userId },
                data:  { espnS2, swid },
            }),
            // Re-sync the league with fresh data
            prisma.league.update({
                where: { id: leagueDbId },
                data: {
                    status:       deriveEspnStatus(settings),
                    scoringType:  deriveEspnScoringType(settings.settings),
                    standings,
                    lastSyncedAt: new Date(),
                },
            }),
        ]);

        return Response.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update credentials';
        const status  = message.includes('credentials') ? 401 : 502;
        return Response.json({ error: message }, { status });
    }
}
