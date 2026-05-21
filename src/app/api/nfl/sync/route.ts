// POST /api/nfl/sync — upsert selected NFL fantasy leagues into FiQ
// DELETE /api/nfl/sync — remove an NFL league
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { trackFeature } from '@/app/actions/analytics';
import {
    getNFLLeagues,
    deriveNFLStatus,
    deriveNFLScoringType,
    defaultNFLRosterPositions,
} from '@/lib/nfl';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as { leagueIds?: string[] };
    if (!Array.isArray(body.leagueIds) || body.leagueIds.length === 0) {
        return Response.json({ error: 'leagueIds[] is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { nflSid: true },
    });

    if (!user?.nflSid) {
        return Response.json({ error: 'NFL not connected' }, { status: 401 });
    }

    try {
        const allLeagues = await getNFLLeagues(user.nflSid);
        const idSet      = new Set(body.leagueIds);
        const toSync     = allLeagues.filter(l => idSet.has(String(l.id)));

        if (toSync.length === 0) {
            return Response.json({ error: 'None of the requested leagues were found' }, { status: 400 });
        }

        const results = await Promise.all(
            toSync.map(async league => {
                const leagueRecord = {
                    leagueName:      league.name,
                    season:          String(league.season),
                    status:          deriveNFLStatus(league),
                    totalRosters:    league.numTeams ?? league.teamCount ?? 12,
                    scoringType:     deriveNFLScoringType(league),
                    rosterPositions: defaultNFLRosterPositions(),
                    lastSyncedAt:    new Date(),
                };

                return prisma.league.upsert({
                    where:  { userId_platform_leagueId: { userId, platform: 'nfl', leagueId: String(league.id) } },
                    create: { userId, platform: 'nfl', leagueId: String(league.id), ...leagueRecord },
                    update: leagueRecord,
                    select: { id: true, leagueId: true, leagueName: true },
                });
            }),
        );

        void trackFeature('nfl_sync', { count: results.length });

        return Response.json({
            synced:    results.length,
            leagues:   results,
            redirectTo: results.length === 1 ? `/dashboard/league/${results[0].id}` : '/dashboard',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        const status  = message.includes('401') || message.includes('not connected') ? 401 : 500;
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
            where: { userId_platform_leagueId: { userId, platform: 'nfl', leagueId } },
        });
        return Response.json({ deleted: true });
    } catch {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }
}
