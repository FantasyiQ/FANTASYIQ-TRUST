import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeague, getLeagueRosters, getTradedPicks, getLeagueDrafts, buildPickOwnerMap } from '@/lib/sleeper';
import type { SleeperRoster, SleeperTradedPick } from '@/lib/sleeper';
import { getDraftPicks, roundOrdinal } from '@/lib/trade-engine';
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

function rounds(n: number) { return Array.from({ length: n }, (_, i) => i + 1); }


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
        const FUTURE = futureSeasons();
        const results = await Promise.allSettled(
            dbUser.leagues.map(async league => {
                const [sleeperLeague, rosters, tradedPicks, drafts] = await Promise.all([
                    getLeague(league.leagueId),
                    getLeagueRosters(league.leagueId),
                    getTradedPicks(league.leagueId),
                    getLeagueDrafts(league.leagueId),
                ]);
                const draftRounds = sleeperLeague.settings?.draft_rounds ?? 5;

                // Use previous season's final standings for tier computation when current
                // season has no data yet (all 0-0 = pre_draft or season hasn't started).
                const currentAllZero = rosters.every(
                    r => (r.settings?.wins ?? 0) === 0 && (r.settings?.losses ?? 0) === 0
                );
                const prevSeasonRosters = (currentAllZero && sleeperLeague.previous_league_id)
                    ? await getLeagueRosters(sleeperLeague.previous_league_id)
                    : undefined;

                const rosterIds    = rosters.map(r => r.roster_id);
                const pickGrid     = getDraftPicks(league.totalRosters, draftRounds);
                const pickByName   = new Map(pickGrid.map(p => [p.name, p]));
                const pickOwnerMap = buildPickOwnerMap(
                    rosters, tradedPicks, FUTURE, drafts, draftRounds, prevSeasonRosters,
                );
                const ROUNDS       = rounds(draftRounds);

                const picks: Player[] = [];
                for (const roster of rosters) {
                    for (const season of FUTURE) {
                        for (const round of ROUNDS) {
                            for (const origId of rosterIds) {
                                const key   = `${season}-${round}-${origId}`;
                                const entry = pickOwnerMap.get(key);
                                if (!entry || Number(entry.owner) !== Number(roster.roster_id)) continue;
                                let pick: Player | undefined;
                                if (entry.slot !== undefined) {
                                    pick = pickByName.get(`${season} ${round}.${entry.slot.toString().padStart(2, '0')}`);
                                } else if (entry.tier) {
                                    pick = pickByName.get(`${season} Round ${round} ${entry.tier} ${roundOrdinal(round)}`);
                                }
                                if (pick) picks.push(pick);
                            }
                        }
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
                <TradeEvaluator allLeaguePicks={allLeaguePicks} />
            </div>
        </main>
    );
}
