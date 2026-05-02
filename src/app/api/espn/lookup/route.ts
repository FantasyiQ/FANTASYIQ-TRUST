import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
    detectEspnSeason,
    getEspnLeagueSettings,
    getEspnTeams,
    deriveEspnScoringType,
    deriveEspnStatus,
} from '@/lib/espn';

// POST /api/espn/lookup — validate ESPN credentials and return league info
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { leagueId?: string; espnS2?: string; swid?: string };
    const leagueId = body.leagueId?.replace(/\s/g, '');
    const espnS2   = body.espnS2?.replace(/\s/g, '');
    const swid     = body.swid?.replace(/\s/g, '');

    if (!leagueId || !espnS2 || !swid) {
        return Response.json({ error: 'leagueId, espnS2, and swid are required' }, { status: 400 });
    }

    try {
        const season = await detectEspnSeason(leagueId, espnS2, swid);
        const [settings, teams] = await Promise.all([
            getEspnLeagueSettings(leagueId, season, espnS2, swid),
            getEspnTeams(leagueId, season, espnS2, swid),
        ]);

        return Response.json({
            leagueId,
            season,
            name:         settings.settings.name,
            size:         settings.settings.size,
            scoringType:  deriveEspnScoringType(settings.settings),
            status:       deriveEspnStatus(settings),
            teamCount:    teams.teams?.length ?? settings.settings.size,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch ESPN league';
        const status  = message.includes('credentials') ? 401 : 502;
        return Response.json({ error: message }, { status });
    }
}
