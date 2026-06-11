import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getLeague,
    getLeagueTransactions,
    getLeagueRosters,
    getLeagueUsers,
    getPlayers,
    type SleeperTransaction,
} from '@/lib/sleeper';

const WEEKS = Array.from({ length: 19 }, (_, i) => i); // 0–18

// Fetch all completed trades for one Sleeper league ID across all weeks.
async function fetchTradesForLeague(sleeperLeagueId: string): Promise<SleeperTransaction[]> {
    const all = (await Promise.all(
        WEEKS.map(w => getLeagueTransactions(sleeperLeagueId, w).catch(() => [] as SleeperTransaction[]))
    )).flat();
    return all.filter(t => t.type === 'trade' && t.status === 'complete');
}

// Walk the previous_league_id chain to collect all historical Sleeper league IDs.
async function collectLeagueChain(startId: string): Promise<string[]> {
    const ids: string[] = [startId];
    let current = startId;
    for (let depth = 0; depth < 10; depth++) {
        const league = await getLeague(current).catch(() => null);
        if (!league?.previous_league_id) break;
        ids.push(league.previous_league_id);
        current = league.previous_league_id;
    }
    return ids;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;

    const league = await prisma.league.findFirst({
        where: { id: leagueId, userId: session.user.id },
        select: { leagueId: true },
    });
    if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const sleeperLeagueId = league.leagueId;

    // Walk all historical seasons + fetch rosters/users for current league in parallel
    const [leagueIds, rosters, users] = await Promise.all([
        collectLeagueChain(sleeperLeagueId),
        getLeagueRosters(sleeperLeagueId),
        getLeagueUsers(sleeperLeagueId),
    ]);

    // Build roster → owner and user display maps from current season
    const rosterToOwner = new Map(rosters.map(r => [r.roster_id, r.owner_id]));
    const userMap = new Map(users.map(u => [u.user_id, { displayName: u.display_name, avatar: u.avatar }]));

    // Fetch all trades across all seasons in parallel
    const allTrades = (await Promise.all(
        leagueIds.map(id => fetchTradesForLeague(id))
    )).flat().sort((a, b) => b.status_updated - a.status_updated);

    // Bulk player name lookup
    const allPlayerIds = [...new Set(allTrades.flatMap(t => Object.keys(t.adds ?? {})))];
    const playerMap = allPlayerIds.length > 0 ? await getPlayers(allPlayerIds) : {};

    // Enrich each trade with team + player info
    const enriched = allTrades.map(t => {
        const sides = t.roster_ids.map(rosterId => {
            const ownerId = rosterToOwner.get(rosterId);
            const user    = ownerId ? userMap.get(ownerId) : null;
            const received = Object.entries(t.adds ?? {})
                .filter(([, rid]) => rid === rosterId)
                .map(([playerId]) => ({
                    type:     'player' as const,
                    playerId,
                    name:     playerMap[playerId]?.full_name ?? playerId,
                    position: playerMap[playerId]?.position ?? null,
                }));
            const picks = (t.draft_picks ?? [])
                .filter(p => p.owner_id === rosterId)
                .map(p => ({ type: 'pick' as const, season: p.season, round: p.round, originalOwner: p.roster_id }));
            return {
                rosterId,
                displayName: user?.displayName ?? `Team ${rosterId}`,
                avatar:      user?.avatar ?? null,
                received:    [...received, ...picks],
            };
        });
        return {
            transactionId: t.transaction_id,
            date:          t.status_updated,
            sides,
        };
    });

    return NextResponse.json({ trades: enriched });
}
