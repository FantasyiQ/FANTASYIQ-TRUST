import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getTradedPicks } from '@/lib/sleeper';
import { PLAYERS, getDraftPicks } from '@/lib/trade-engine';
import type { Player } from '@/lib/trade-engine';
import TradeEvaluator from './TradeEvaluator';

export const maxDuration = 30;

// Shared pick-year logic (matches league page)
function futureSeasons(): string[] {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const pastDraft = m > 4 || (m === 4 && d >= 25);
    const base = pastDraft ? now.getFullYear() + 1 : now.getFullYear();
    return [String(base), String(base + 1), String(base + 2)];
}

const ROUNDS = [1, 2, 3, 4, 5];

type TradedPick = { season: string; round: number; roster_id: number; owner_id: number; previous_owner_id: number };

function resolveOwnedPicks(
    rosterId:     number,
    rosterIds:    number[],
    standings:    Map<number, number>,
    tradedPicks:  TradedPick[],
): { season: string; round: number; slot: number }[] {
    const FUTURE = futureSeasons();

    const groups = new Map<string, TradedPick[]>();
    for (const tp of tradedPicks) {
        const key = `${tp.season}-${Number(tp.round)}-${Number(tp.roster_id)}`;
        const g = groups.get(key) ?? [];
        g.push(tp);
        groups.set(key, g);
    }
    const pickOwnerMap = new Map<string, number>();
    for (const [key, trades] of groups) {
        if (trades.length === 1) {
            pickOwnerMap.set(key, Number(trades[0].owner_id));
        } else {
            const prevOwnerIds = new Set(trades.map(t => Number(t.previous_owner_id)));
            const terminal = trades.find(t => !prevOwnerIds.has(Number(t.owner_id)));
            pickOwnerMap.set(key, Number(terminal?.owner_id ?? trades[trades.length - 1].owner_id));
        }
    }

    const owned: { season: string; round: number; slot: number }[] = [];
    for (const season of FUTURE) {
        for (const round of ROUNDS) {
            for (const origId of rosterIds) {
                const key = `${season}-${round}-${origId}`;
                const owner = pickOwnerMap.get(key) ?? origId;
                if (Number(owner) === Number(rosterId)) {
                    owned.push({ season, round, slot: standings.get(origId) ?? 1 });
                }
            }
        }
    }
    return owned;
}

const DEPTH_BASE: Record<string, number> = { QB: 22, RB: 18, WR: 18, TE: 14, K: 8, DEF: 8 };

export default async function TradePage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            sleeperUserId: true,
            leagues: { select: { leagueId: true, leagueName: true, totalRosters: true } },
        },
    });

    let myPicks:        Player[] = [];
    let myRoster:       Player[] = [];
    let allLeaguePicks: Player[] = [];

    if (dbUser?.sleeperUserId && dbUser.leagues.length > 0) {
        // Build player lookup from the curated list
        const curatedByName = new Map(PLAYERS.map(p => [p.name.toLowerCase(), p]));

        // Collect all Sleeper player IDs on the user's roster(s) across leagues
        const myPlayerIds = new Set<string>();

        const results = await Promise.allSettled(
            dbUser.leagues.map(async league => {
                const [rosters, tradedPicks] = await Promise.all([
                    getLeagueRosters(league.leagueId),
                    getTradedPicks(league.leagueId),
                ]);

                const myRosterRecord = rosters.find(r => String(r.owner_id) === String(dbUser.sleeperUserId));
                if (!myRosterRecord) return { myPickPlayers: [] as Player[], allPickPlayers: [] as Player[], playerIds: [] as string[] };

                // Collect roster player IDs
                const playerIds = (myRosterRecord.players ?? []).filter(id => id && id !== '0');

                const sorted = [...rosters].sort((a, b) => {
                    const wa = a.settings?.wins ?? 0, wb = b.settings?.wins ?? 0;
                    if (wa !== wb) return wb - wa;
                    const fa = (a.settings?.fpts ?? 0) + (a.settings?.fpts_decimal ?? 0) / 100;
                    const fb = (b.settings?.fpts ?? 0) + (b.settings?.fpts_decimal ?? 0) / 100;
                    return fb - fa;
                });
                const standings = new Map(sorted.map((r, i) => [r.roster_id, league.totalRosters - i]));
                const rosterIds = rosters.map(r => r.roster_id);
                const pickGrid = getDraftPicks(league.totalRosters);
                const pickByName = new Map(pickGrid.map(p => [p.name, p]));

                // My picks
                const ownedByMe = resolveOwnedPicks(myRosterRecord.roster_id, rosterIds, standings, tradedPicks as TradedPick[]);
                const myPickPlayers = ownedByMe
                    .map(op => pickByName.get(`${op.season} ${op.round}.${op.slot.toString().padStart(2, '0')}`))
                    .filter((p): p is Player => p !== undefined);

                // All teams' picks
                const allPickPlayers: Player[] = [];
                for (const roster of rosters) {
                    const owned = resolveOwnedPicks(roster.roster_id, rosterIds, standings, tradedPicks as TradedPick[]);
                    for (const op of owned) {
                        const pick = pickByName.get(`${op.season} ${op.round}.${op.slot.toString().padStart(2, '0')}`);
                        if (pick) allPickPlayers.push(pick);
                    }
                }

                return { myPickPlayers, allPickPlayers, playerIds };
            })
        );

        // Aggregate across leagues — deduplicate by name
        const myPicksSeen      = new Set<string>();
        const allPicksSeen     = new Set<string>();

        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            const { myPickPlayers, allPickPlayers, playerIds } = r.value;
            for (const p of myPickPlayers) {
                if (!myPicksSeen.has(p.name)) { myPicksSeen.add(p.name); myPicks.push(p); }
            }
            for (const p of allPickPlayers) {
                if (!allPicksSeen.has(p.name)) { allPicksSeen.add(p.name); allLeaguePicks.push(p); }
            }
            for (const id of playerIds) myPlayerIds.add(id);
        }

        // Load roster player details from DB
        if (myPlayerIds.size > 0) {
            const dbPlayers = await prisma.sleeperPlayer.findMany({
                where: { playerId: { in: [...myPlayerIds] } },
                select: { playerId: true, fullName: true, position: true, team: true, age: true },
            });

            const rosterSeen = new Set<string>();
            let depthRank = 400;
            for (const dp of dbPlayers) {
                const nameLower = dp.fullName.toLowerCase();
                if (rosterSeen.has(nameLower)) continue;
                rosterSeen.add(nameLower);
                const curated = curatedByName.get(nameLower);
                if (curated) {
                    myRoster.push({ ...curated, team: dp.team || curated.team, age: dp.age ?? curated.age });
                } else {
                    myRoster.push({
                        rank:      depthRank++,
                        name:      dp.fullName,
                        position:  dp.position,
                        team:      dp.team ?? '',
                        age:       dp.age ?? 26,
                        baseValue: DEPTH_BASE[dp.position] ?? 10,
                    });
                }
            }
        }
    }

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-6">
                <div>
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Dynamic Trade Values</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Values adjust for position scarcity, age curve, and your PPR format. Search players to evaluate any trade.
                    </p>
                </div>
                <TradeEvaluator myPicks={myPicks} myRoster={myRoster} allLeaguePicks={allLeaguePicks} />
            </div>
        </main>
    );
}
