import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getTradedPicks } from '@/lib/sleeper';
import { getDraftPicks } from '@/lib/trade-engine';
import type { Player } from '@/lib/trade-engine';
import TradeEvaluator from './TradeEvaluator';

export const maxDuration = 30;

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
    rosterId:    number,
    rosterIds:   number[],
    standings:   Map<number, number>,
    tradedPicks: TradedPick[],
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

    let allLeaguePicks: Player[] = [];

    if (dbUser?.sleeperUserId && dbUser.leagues.length > 0) {
        const results = await Promise.allSettled(
            dbUser.leagues.map(async league => {
                const [rosters, tradedPicks] = await Promise.all([
                    getLeagueRosters(league.leagueId),
                    getTradedPicks(league.leagueId),
                ]);

                const sorted = [...rosters].sort((a, b) => {
                    const wa = a.settings?.wins ?? 0, wb = b.settings?.wins ?? 0;
                    if (wa !== wb) return wb - wa;
                    const fa = (a.settings?.fpts ?? 0) + (a.settings?.fpts_decimal ?? 0) / 100;
                    const fb = (b.settings?.fpts ?? 0) + (b.settings?.fpts_decimal ?? 0) / 100;
                    return fb - fa;
                });
                const standings = new Map(sorted.map((r, i) => [r.roster_id, league.totalRosters - i]));
                const rosterIds = rosters.map(r => r.roster_id);
                const pickGrid  = getDraftPicks(league.totalRosters);
                const pickByName = new Map(pickGrid.map(p => [p.name, p]));

                const picks: Player[] = [];
                for (const roster of rosters) {
                    const owned = resolveOwnedPicks(roster.roster_id, rosterIds, standings, tradedPicks as TradedPick[]);
                    for (const op of owned) {
                        const pick = pickByName.get(`${op.season} ${op.round}.${op.slot.toString().padStart(2, '0')}`);
                        if (pick) picks.push(pick);
                    }
                }
                return picks;
            })
        );

        const seen = new Set<string>();
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            for (const p of r.value) {
                if (!seen.has(p.name)) { seen.add(p.name); allLeaguePicks.push(p); }
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
                <TradeEvaluator hideQuickPick allLeaguePicks={allLeaguePicks} />
            </div>
        </main>
    );
}
