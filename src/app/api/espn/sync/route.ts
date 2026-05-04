import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    detectEspnSeason,
    getEspnFullSync,
    normalizeEspnLeague,
    deriveEspnRosterPositions,
    deriveEspnStatus,
    deriveEspnScoringType,
} from '@/lib/espn';

// POST /api/espn/sync — full sync: settings + teams + rosters + matchups
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as { leagueId?: string; espnS2?: string; swid?: string };
    const leagueId = body.leagueId?.replace(/\s/g, '');
    const espnS2   = body.espnS2?.replace(/\s/g, '');
    const swid     = body.swid?.replace(/\s/g, '');

    if (!leagueId || !espnS2 || !swid) {
        return Response.json({ error: 'leagueId, espnS2, and swid are required' }, { status: 400 });
    }

    try {
        const season  = await detectEspnSeason(leagueId, espnS2, swid);
        const rawData = await getEspnFullSync(leagueId, season, espnS2, swid);
        const data    = normalizeEspnLeague(rawData, leagueId);

        // Current week matchups only (reduces noise in stored data)
        const currentWeekMatchups = data.matchups.filter(m => m.week === data.currentWeek);

        const leagueRecord = {
            leagueId,
            leagueName:      data.leagueName,
            season:          String(data.season),
            status:          deriveEspnStatus(rawData),
            totalRosters:    data.totalTeams,
            scoringType:     deriveEspnScoringType(rawData.settings),
            rosterPositions: deriveEspnRosterPositions(rawData.settings),
            standings:       data.teams.map(t => ({
                teamId:       t.teamId,
                name:         t.name,
                abbrev:       t.abbrev,
                ownerId:      t.ownerId,
                wins:         t.wins,
                losses:       t.losses,
                ties:         t.ties,
                fpts:         t.pointsFor,
                fptsAgainst:  t.pointsAgainst,
                rosterSize:   t.roster.length,
            })),
            currentMatchup: currentWeekMatchups.length > 0 ? JSON.parse(JSON.stringify({
                week:     data.currentWeek,
                matchups: currentWeekMatchups,
            })) : null,
            lastSyncedAt: new Date(),
        };

        const [league] = await Promise.all([
            prisma.league.upsert({
                where:  { userId_platform_leagueId: { userId, platform: 'espn', leagueId } },
                create: { userId, platform: 'espn', ...leagueRecord, standings: JSON.parse(JSON.stringify(leagueRecord.standings)) },
                update: { ...leagueRecord, standings: JSON.parse(JSON.stringify(leagueRecord.standings)) },
                select: { id: true, leagueId: true, leagueName: true },
            }),
            prisma.user.update({
                where: { id: userId },
                data:  { espnS2, swid },
            }),
        ]);

        return Response.json({
            synced:     1,
            leagueDbId: league.id,
            summary: {
                teams:    data.teams.length,
                matchups: currentWeekMatchups.length,
                week:     data.currentWeek,
            },
            redirectTo: `/dashboard/league/${league.id}`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        const status  = message.includes('credentials') ? 401 : 500;
        return Response.json({ error: message }, { status });
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
