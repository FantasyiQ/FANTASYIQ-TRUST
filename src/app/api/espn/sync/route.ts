import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    detectEspnSeason,
    getEspnLeagueSettings,
    getEspnTeams,
    deriveEspnScoringType,
    deriveEspnRosterPositions,
    deriveEspnStatus,
    buildEspnStandings,
} from '@/lib/espn';

// POST /api/espn/sync — upsert an ESPN league and persist credentials
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as { leagueId?: string; espnS2?: string; swid?: string };
    const leagueId = body.leagueId?.trim();
    const espnS2   = body.espnS2?.trim();
    const swid     = body.swid?.trim();

    if (!leagueId || !espnS2 || !swid) {
        return Response.json({ error: 'leagueId, espnS2, and swid are required' }, { status: 400 });
    }

    try {
        const season = await detectEspnSeason(leagueId, espnS2, swid);
        const [settings, teamsData] = await Promise.all([
            getEspnLeagueSettings(leagueId, season, espnS2, swid),
            getEspnTeams(leagueId, season, espnS2, swid),
        ]);

        const standings = buildEspnStandings(teamsData.teams ?? []);

        const leagueData = {
            leagueId,
            leagueName:      settings.settings.name,
            season:          String(season),
            status:          deriveEspnStatus(settings),
            totalRosters:    settings.settings.size,
            scoringType:     deriveEspnScoringType(settings.settings),
            rosterPositions: deriveEspnRosterPositions(settings.settings),
            standings,
            lastSyncedAt:    new Date(),
        };

        const [league] = await Promise.all([
            prisma.league.upsert({
                where:  { userId_platform_leagueId: { userId, platform: 'espn', leagueId } },
                create: { userId, platform: 'espn', ...leagueData },
                update: leagueData,
                select: { id: true, leagueId: true, leagueName: true, totalRosters: true, scoringType: true, assignedPlanId: true },
            }),
            // Store ESPN credentials on the user for cron refreshes
            prisma.user.update({
                where: { id: userId },
                data:  { espnS2, swid },
            }),
        ]);

        return Response.json({
            synced:     1,
            leagueDbId: league.id,
            redirectTo: `/dashboard/league/${league.id}`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}

// DELETE /api/espn/sync?leagueId=xxx
export async function DELETE(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const leagueId = request.nextUrl.searchParams.get('leagueId');
    if (!leagueId) return Response.json({ error: 'leagueId is required' }, { status: 400 });

    try {
        await prisma.league.delete({
            where: { userId_platform_leagueId: { userId, platform: 'espn', leagueId } },
        });
        return Response.json({ deleted: true });
    } catch {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }
}
