import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeague, getLeagueRosters, deriveScoringType } from '@/lib/sleeper';

// POST /api/sleeper/leagues/[leagueId]/refresh
// Re-fetches a single league from Sleeper and updates the DB record.
// [leagueId] is the internal DB id (League.id).
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, leagueId: true, userId: true },
    });
    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        const [sleeperLeague, rosters] = await Promise.all([
            getLeague(league.leagueId),
            getLeagueRosters(league.leagueId),
        ]);

        const standings = rosters
            .map(r => ({
                rosterId: r.roster_id,
                ownerId:  r.owner_id,
                wins:     r.settings?.wins    ?? 0,
                losses:   r.settings?.losses  ?? 0,
                ties:     r.settings?.ties    ?? 0,
                fpts:     (r.settings?.fpts   ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
            }))
            .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);

        const updated = await prisma.league.update({
            where: { id: leagueId },
            data: {
                leagueName:      sleeperLeague.name,
                season:          sleeperLeague.season,
                status:          sleeperLeague.status,
                totalRosters:    sleeperLeague.total_rosters,
                scoringType:     deriveScoringType(sleeperLeague),
                avatar:          sleeperLeague.avatar ?? null,
                rosterPositions: sleeperLeague.roster_positions,
                standings,
                lastSyncedAt:    new Date(),
            },
            select: {
                id: true, leagueId: true, leagueName: true, season: true,
                status: true, totalRosters: true, scoringType: true,
                avatar: true, standings: true, lastSyncedAt: true,
            },
        });

        return Response.json(updated);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
