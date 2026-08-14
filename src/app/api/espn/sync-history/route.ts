import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getEspnFullSync,
    normalizeEspnLeague,
    deriveEspnStatus,
    deriveEspnScoringType,
    deriveEspnRosterPositions,
} from '@/lib/espn';

// POST /api/espn/sync-history
// Body: { leagueId: string; seasons: number[] }
// Syncs historical ESPN seasons as separate League records.
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const dbUser = await prisma.user.findUnique({
        where:  { id: userId },
        select: { espnS2: true, swid: true },
    });
    if (!dbUser?.espnS2 || !dbUser.swid) {
        return Response.json({ error: 'ESPN credentials required. Connect via Settings first.' }, { status: 400 });
    }

    const body    = await request.json() as { leagueId?: string; seasons?: number[] };
    const leagueId = body.leagueId?.trim();
    const seasons  = body.seasons;

    if (!leagueId || !seasons?.length) {
        return Response.json({ error: 'leagueId and seasons are required.' }, { status: 400 });
    }
    if (seasons.length > 10) {
        return Response.json({ error: 'Max 10 seasons at once.' }, { status: 400 });
    }

    const results: { season: number; ok: boolean; error?: string }[] = [];

    for (const season of seasons) {
        try {
            const rawData = await getEspnFullSync(leagueId, season, dbUser.espnS2, dbUser.swid);
            const data    = normalizeEspnLeague(rawData, leagueId);

            await prisma.league.upsert({
                where:  { userId_platform_leagueId_season: { userId, platform: 'espn', leagueId, season: String(season) } },
                create: {
                    userId,
                    platform:        'espn',
                    leagueId,
                    leagueName:      data.leagueName,
                    season:          String(season),
                    status:          deriveEspnStatus(rawData),
                    totalRosters:    data.totalTeams,
                    scoringType:     deriveEspnScoringType(rawData.settings),
                    rosterPositions: deriveEspnRosterPositions(rawData.settings),
                    standings:       data.teams.map(t => ({
                        teamId: t.teamId, name: t.name, abbrev: t.abbrev,
                        ownerId: t.ownerId, ownerName: t.ownerName,
                        wins: t.wins, losses: t.losses, ties: t.ties,
                        fpts: t.pointsFor, fptsAgainst: t.pointsAgainst,
                        rosterSize: t.roster.length,
                        players: t.roster.map(p => ({ name: p.fullName, position: p.position })),
                    })),
                    lastSyncedAt: new Date(),
                    isHistorical: true,
                },
                update: {
                    leagueName:      data.leagueName,
                    status:          deriveEspnStatus(rawData),
                    totalRosters:    data.totalTeams,
                    scoringType:     deriveEspnScoringType(rawData.settings),
                    rosterPositions: deriveEspnRosterPositions(rawData.settings),
                    standings:       data.teams.map(t => ({
                        teamId: t.teamId, name: t.name, abbrev: t.abbrev,
                        ownerId: t.ownerId, ownerName: t.ownerName,
                        wins: t.wins, losses: t.losses, ties: t.ties,
                        fpts: t.pointsFor, fptsAgainst: t.pointsAgainst,
                        rosterSize: t.roster.length,
                        players: t.roster.map(p => ({ name: p.fullName, position: p.position })),
                    })),
                    lastSyncedAt: new Date(),
                },
            });
            results.push({ season, ok: true });
        } catch (err) {
            results.push({ season, ok: false, error: err instanceof Error ? err.message : 'Sync failed' });
        }
    }

    const synced = results.filter(r => r.ok).length;
    return Response.json({ synced, total: seasons.length, results });
}
