import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getLeague,
    getLeagueDrafts,
    getLeagueTransactions,
    getLeagueRosters,
    getLeagueUsers,
    getActiveDraftPicks,
    getPlayers,
    type SleeperTransaction,
} from '@/lib/sleeper';

const WEEKS = Array.from({ length: 19 }, (_, i) => i); // 0–18

async function fetchTradesForLeague(sleeperLeagueId: string): Promise<SleeperTransaction[]> {
    const all = (await Promise.all(
        WEEKS.map(w => getLeagueTransactions(sleeperLeagueId, w).catch(() => [] as SleeperTransaction[]))
    )).flat();
    return all.filter(t => t.type === 'trade' && t.status === 'complete');
}

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

// Build a map of season_round_originalRosterId → { playerName, position, pickNo }
// for all completed drafts across the league chain.
async function buildDraftedPlayerMap(
    leagueIds: string[],
    playerMap: Record<string, { full_name: string; position: string }>,
): Promise<Map<string, { name: string; position: string; pickNo: number }>> {
    const result = new Map<string, { name: string; position: string; pickNo: number }>();

    await Promise.all(leagueIds.map(async leagueId => {
        const drafts = await getLeagueDrafts(leagueId).catch(() => []);
        const completed = drafts.filter(d => d.status === 'complete');

        await Promise.all(completed.map(async draft => {
            const picks = await getActiveDraftPicks(draft.draft_id).catch(() => []);
            for (const pick of picks) {
                if (!pick.player_id) continue;
                // slot_roster_id = original team's roster_id (present when pick was traded)
                // Falls back to roster_id (the team that made the pick) for untraded picks.
                const slotRosterId = pick.metadata?.slot_roster_id ?? String(pick.roster_id);
                const key = `${draft.season}_${pick.round}_${slotRosterId}`;
                const player = playerMap[pick.player_id];
                result.set(key, {
                    name:     player?.full_name ?? pick.player_id,
                    position: player?.position  ?? '',
                    pickNo:   pick.pick_no,
                });
            }
        }));
    }));

    return result;
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

    const [leagueIds, rosters, users] = await Promise.all([
        collectLeagueChain(sleeperLeagueId),
        getLeagueRosters(sleeperLeagueId),
        getLeagueUsers(sleeperLeagueId),
    ]);

    const rosterToOwner = new Map(rosters.map(r => [r.roster_id, r.owner_id]));
    const userMap = new Map(users.map(u => [u.user_id, { displayName: u.display_name, avatar: u.avatar }]));

    const allTrades = (await Promise.all(
        leagueIds.map(id => fetchTradesForLeague(id))
    )).flat().sort((a, b) => b.status_updated - a.status_updated);

    // Bulk player name lookup for all traded players
    const allPlayerIds = [...new Set(allTrades.flatMap(t => Object.keys(t.adds ?? {})))];
    const playerMap = allPlayerIds.length > 0 ? await getPlayers(allPlayerIds) : {};

    // Build drafted-player lookup for completed drafts (picks in past seasons)
    const draftedMap = await buildDraftedPlayerMap(leagueIds, playerMap as Record<string, { full_name: string; position: string }>);

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
                .map(p => {
                    const origOwnerId = rosterToOwner.get(p.roster_id);
                    const origUser    = origOwnerId ? userMap.get(origOwnerId) : null;
                    const draftKey    = `${p.season}_${p.round}_${p.roster_id}`;
                    const drafted     = draftedMap.get(draftKey);
                    return {
                        type:              'pick' as const,
                        season:            p.season,
                        round:             p.round,
                        originalOwnerName: origUser?.displayName ?? `Team ${p.roster_id}`,
                        draftedPlayer:     drafted ?? null,
                    };
                });

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
