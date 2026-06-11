import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueTransactions, getLeagueRosters, getLeagueUsers, getNflState, getPlayers } from '@/lib/sleeper';

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

    // Fetch rosters, users, and NFL state in parallel to build lookup maps
    const [rosters, users, nflState] = await Promise.all([
        getLeagueRosters(sleeperLeagueId),
        getLeagueUsers(sleeperLeagueId),
        getNflState(),
    ]);

    // Maps for enriching transactions
    const rosterToOwner = new Map(rosters.map(r => [r.roster_id, r.owner_id]));
    const userMap = new Map(users.map(u => [u.user_id, { displayName: u.display_name, avatar: u.avatar }]));

    // Fetch transactions for weeks 0–current (0 = off-season trading)
    const maxWeek = Math.max(nflState.week ?? 18, 1);
    const weeks = Array.from({ length: maxWeek + 1 }, (_, i) => i); // 0..maxWeek

    const allTransactions = (await Promise.all(
        weeks.map(w => getLeagueTransactions(sleeperLeagueId, w).catch(() => []))
    )).flat();

    const trades = allTransactions
        .filter(t => t.type === 'trade' && t.status === 'complete')
        .sort((a, b) => b.status_updated - a.status_updated);

    // Collect all player IDs across trades for bulk name lookup
    const allPlayerIds = [...new Set(
        trades.flatMap(t => Object.keys(t.adds ?? {}))
    )];
    const playerMap = allPlayerIds.length > 0 ? await getPlayers(allPlayerIds) : {};

    // Enrich each trade with team info
    const enriched = trades.map(t => {
        const sides = t.roster_ids.map(rosterId => {
            const ownerId  = rosterToOwner.get(rosterId);
            const user     = ownerId ? userMap.get(ownerId) : null;
            const received = Object.entries(t.adds ?? {})
                .filter(([, rid]) => rid === rosterId)
                .map(([playerId]) => ({
                    type: 'player' as const,
                    playerId,
                    name: playerMap[playerId]?.full_name ?? playerId,
                    position: playerMap[playerId]?.position ?? null,
                }));
            const picks = (t.draft_picks ?? [])
                .filter(p => p.owner_id === rosterId)
                .map(p => ({ type: 'pick' as const, season: p.season, round: p.round, originalOwner: p.roster_id }));
            return {
                rosterId,
                displayName: user?.displayName ?? `Team ${rosterId}`,
                avatar: user?.avatar ?? null,
                received: [...received, ...picks],
            };
        });
        return {
            transactionId: t.transaction_id,
            date: t.status_updated,
            sides,
        };
    });

    return NextResponse.json({ trades: enriched });
}
