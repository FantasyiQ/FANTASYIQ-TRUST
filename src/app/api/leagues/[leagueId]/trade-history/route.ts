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
    type SleeperDraftPickEntry,
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

interface DraftPickData {
    season:     string;
    picks:      SleeperDraftPickEntry[];
    slotToRosterId: Map<number, number>; // draft_slot → roster_id (original team)
}

// For each league in the chain, fetch completed drafts + their picks + slot→roster mapping.
async function fetchAllDraftData(leagueIds: string[]): Promise<DraftPickData[]> {
    const results: DraftPickData[] = [];

    await Promise.all(leagueIds.map(async leagueId => {
        const [drafts, rosters] = await Promise.all([
            getLeagueDrafts(leagueId).catch(() => []),
            getLeagueRosters(leagueId).catch(() => []),
        ]);

        const completed = drafts.filter(d => d.status === 'complete');

        await Promise.all(completed.map(async draft => {
            const picks = await getActiveDraftPicks(draft.draft_id).catch(() => []);
            if (!picks.length) return;

            // Build slot → rosterId from draft_order (userId → slot) + rosters (owner_id → roster_id)
            const ownerToRoster = new Map(rosters.map(r => [r.owner_id, r.roster_id]));
            const slotToRosterId = new Map<number, number>();
            for (const [userId, slot] of Object.entries(draft.draft_order ?? {})) {
                const rosterId = ownerToRoster.get(userId);
                if (rosterId != null) slotToRosterId.set(slot as number, rosterId);
            }

            results.push({ season: draft.season, picks, slotToRosterId });
        }));
    }));

    return results;
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

    // Fetch all trades + all draft pick data in parallel
    const [allTrades, allDraftData] = await Promise.all([
        Promise.all(leagueIds.map(fetchTradesForLeague)).then(r => r.flat()),
        fetchAllDraftData(leagueIds),
    ]);

    allTrades.sort((a, b) => b.status_updated - a.status_updated);

    // Build drafted-player lookup: `season_round_originalRosterId` → pick info
    // Key: season + round + the roster_id that ORIGINALLY owned the pick (before any trades)
    // For each pick entry, determine the original roster via:
    //   1. metadata.slot_roster_id (set by Sleeper for traded picks)
    //   2. slotToRosterId[pick.draft_slot] (derived from draft_order — works for all picks)
    const draftPickPlayerIds = new Set<string>();
    const rawDraftMap = new Map<string, { playerId: string; pickNo: number }>();

    for (const { season, picks, slotToRosterId } of allDraftData) {
        for (const pick of picks) {
            if (!pick.player_id) continue;
            draftPickPlayerIds.add(pick.player_id);

            const slotRosterId =
                pick.metadata?.slot_roster_id != null
                    ? Number(pick.metadata.slot_roster_id)
                    : slotToRosterId.get(pick.draft_slot);

            if (slotRosterId == null) continue;
            const key = `${season}_${pick.round}_${slotRosterId}`;
            rawDraftMap.set(key, { playerId: pick.player_id, pickNo: pick.pick_no });
        }
    }

    // Bulk fetch player names for both traded players and drafted players
    const tradedPlayerIds = [...new Set(allTrades.flatMap(t => Object.keys(t.adds ?? {})))];
    const allPlayerIds = [...new Set([...tradedPlayerIds, ...draftPickPlayerIds])];
    const playerMap = allPlayerIds.length > 0 ? await getPlayers(allPlayerIds) : {};

    // Final drafted player lookup with names resolved
    const draftedMap = new Map(
        [...rawDraftMap.entries()].map(([key, { playerId, pickNo }]) => [
            key,
            {
                name:     playerMap[playerId]?.full_name ?? playerId,
                position: playerMap[playerId]?.position  ?? '',
                pickNo,
            },
        ])
    );

    // Enrich trades
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
                    const drafted     = draftedMap.get(draftKey) ?? null;
                    return {
                        type:              'pick' as const,
                        season:            p.season,
                        round:             p.round,
                        originalOwnerName: origUser?.displayName ?? `Team ${p.roster_id}`,
                        draftedPlayer:     drafted,
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
