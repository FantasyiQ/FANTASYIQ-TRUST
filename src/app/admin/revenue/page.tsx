export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

// ── Pricing table (matches PricingClient.tsx COMM_PRICES) ────────────────────

type TeamSize = 8 | 10 | 12 | 14 | 16 | 32;

const COMM_PRICES: Record<TeamSize, [number, number, number]> = {
    8:  [54.99,  64.99,  74.99 ],
    10: [64.99,  74.99,  84.99 ],
    12: [74.99,  84.99,  94.99 ],
    14: [84.99,  94.99,  104.99],
    16: [94.99,  104.99, 114.99],
    32: [174.99, 184.99, 194.99],
};

const TIER_INDEX: Record<string, number> = {
    COMMISSIONER_PRO: 0, COMMISSIONER_ALL_PRO: 1, COMMISSIONER_ELITE: 2,
};

function commPrice(tier: string, leagueSize: number | null): number {
    if (!leagueSize) return 0;
    const idx   = TIER_INDEX[tier] ?? 0;
    const prices = COMM_PRICES[leagueSize as TeamSize];
    return prices ? prices[idx] : 0;
}

const PLAYER_PRICES: Record<string, number> = {
    PLAYER_PRO: 9.99, PLAYER_ALL_PRO: 24.99, PLAYER_ELITE: 44.99,
};
function playerPrice(tier: string): number { return PLAYER_PRICES[tier] ?? 0; }

function StatCard({ label, value, sub, accent }: {
    label: string; value: string; sub?: string; accent?: boolean;
}) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
            <p className={`text-3xl font-black tabular-nums ${accent ? 'text-[#D4AF37]' : 'text-white'}`}>{value}</p>
            {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
    );
}

function startOf(daysAgo: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
}

export default async function AdminRevenuePage() {
    const [
        activeSubs,
        newSubsThisMonth,
        canceledThisMonth,
        recentSubs,
        duesAgg,
        winnersAgg,
        leaguesWithDues,
        stripeOnBehalfCount,
        futureDuesStripeCount,
    ] = await Promise.all([
        prisma.subscription.findMany({
            where:  { status: { in: ['active', 'trialing'] } },
            select: { tier: true, type: true, leagueSize: true, status: true, createdAt: true },
        }),
        prisma.subscription.count({
            where: { createdAt: { gte: startOf(30) }, status: { in: ['active', 'trialing'] } },
        }),
        prisma.subscription.count({
            where: { updatedAt: { gte: startOf(30) }, status: 'canceled' },
        }),
        prisma.subscription.findMany({
            orderBy: { createdAt: 'desc' },
            take:    30,
            select:  {
                id: true, tier: true, type: true, leagueSize: true,
                leagueName: true, status: true, createdAt: true,
                stripeSubscriptionId: true,
            },
        }),
        // Total dues collected across all leagues
        prisma.leagueDues.aggregate({
            _sum: { potTotal: true },
        }),
        // Winners: paid out vs pending
        prisma.leagueWinner.groupBy({
            by:    ['paidOut'],
            _sum:  { amount: true },
            _count: { id: true },
        }),
        // Per-league breakdown for the escrow table
        prisma.leagueDues.findMany({
            select: {
                id:            true,
                leagueName:    true,
                season:        true,
                status:        true,
                potTotal:      true,
                buyInAmount:   true,
                teamCount:     true,
                winners:       { select: { amount: true, paidOut: true } },
                _count:        { select: { members: { where: { duesStatus: 'paid' } } } },
            },
            orderBy: { createdAt: 'desc' },
        }),
        // Pay-on-behalf Stripe transactions (commissioner pays for a member)
        prisma.duesMember.count({
            where: { paymentMethod: 'stripe_on_behalf' },
        }),
        // Future dues paid via Stripe
        prisma.futureDuesObligation.count({
            where: { paymentMethod: 'stripe_on_behalf' },
        }),
    ]);

    // ARR: commissioner plan + player plan revenue combined
    const playerSubs = activeSubs.filter(s => s.type === 'player');
    const commArr    = activeSubs.filter(s => s.type === 'commissioner')
                                 .reduce((sum, s) => sum + commPrice(s.tier, s.leagueSize), 0);
    const playerArr  = playerSubs.reduce((sum, s) => sum + playerPrice(s.tier), 0);
    const arr        = commArr + playerArr;
    const mrr        = arr / 12;

    // Subscription Stripe fees (2.9% + $0.30/sub on actual billed amount)
    // ELITE100 = $0 charge = $0 fee; non-ELITE100 subs billed at full price
    // We use arr as the billed base — ELITE100 subs inflate this, so treat as ceiling
    const estSubStripeFees = arr * 0.029 + activeSubs.length * 0.30;

    // Balance split
    const totalDuesCollected = duesAgg._sum.potTotal ?? 0;
    const paidOutRow   = winnersAgg.find(r => r.paidOut === true);
    const pendingRow   = winnersAgg.find(r => r.paidOut === false);
    const alreadyPaidOut  = paidOutRow?._sum.amount  ?? 0;
    const pendingPayouts  = pendingRow?._sum.amount  ?? 0;
    const stillInEscrow   = totalDuesCollected - alreadyPaidOut;

    // Fee estimates
    // Stripe processing: 2.9% + $0.30 per transaction
    // Self-pay (stripe_direct) counted via filtered _count on each league
    const selfPayCount     = leaguesWithDues.reduce((sum, l) => sum + l._count.members, 0);
    const totalPaidMembers = selfPayCount + stripeOnBehalfCount + futureDuesStripeCount;
    const estStripeFees    = totalDuesCollected * 0.029 + totalPaidMembers * 0.30;
    // Stripe Connect payout fee: 1.5% of gross escrow (all dues collected will eventually be paid out)
    const estPayoutFees      = stillInEscrow * 0.015;
    const netEscrowAfterFees = stillInEscrow - estStripeFees - estPayoutFees;

    // Break down by tier
    const byTier = new Map<string, number>();
    for (const s of activeSubs) {
        byTier.set(s.tier, (byTier.get(s.tier) ?? 0) + 1);
    }

    // Break down commissioner subs by league size
    const commSubs = activeSubs.filter(s => s.type === 'commissioner');
    const bySize   = new Map<number, number>();
    for (const s of commSubs) {
        if (s.leagueSize) bySize.set(s.leagueSize, (bySize.get(s.leagueSize) ?? 0) + 1);
    }

    function fmt(n: number) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    }

    function tierLabel(tier: string) {
        return tier.replace(/_/g, ' ').replace('COMMISSIONER', 'Comm').replace('PLAYER', 'Player').replace('ALL PRO', 'All-Pro').replace(/\b\w/g, c => c.toUpperCase());
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Revenue</h1>
                <p className="text-gray-500 text-sm mt-1">Subscription analytics and revenue estimates</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Est. MRR"      value={fmt(mrr)}       sub="Annual ÷ 12"                       accent />
                <StatCard label="Est. ARR"       value={fmt(arr)}       sub={`${fmt(commArr)} comm · ${fmt(playerArr)} player`} />
                <StatCard label="Active Subs"    value={String(activeSubs.length)} sub={`${commSubs.length} comm · ${playerSubs.length} player`} />
                <StatCard label="New (30d)"      value={String(newSubsThisMonth)}  sub={`${canceledThisMonth} canceled`} />
            </div>

            {/* Sub Stripe fees */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider mb-1">Est. Subscription Stripe Fees</p>
                        <p className="text-2xl font-black text-white tabular-nums">{fmt(estSubStripeFees)}</p>
                        <p className="text-xs text-gray-600 mt-1">2.9% of ARR + $0.30 × {activeSubs.length} subs — ceiling estimate (ELITE100 subs = $0 actual fee)</p>
                    </div>
                    <div className="text-right text-xs text-gray-600 space-y-1">
                        <p>Comm fees: <span className="text-gray-400">{fmt(commArr * 0.029 + commSubs.length * 0.30)}</span></p>
                        <p>Player fees: <span className="text-gray-400">{fmt(playerArr * 0.029 + playerSubs.length * 0.30)}</span></p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* By tier */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Active Subscriptions by Tier</p>
                    <div className="space-y-3">
                        {Array.from(byTier.entries()).sort((a, b) => b[1] - a[1]).map(([tier, count]) => {
                            const total = activeSubs.length || 1;
                            return (
                                <div key={tier}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm text-gray-300">{tierLabel(tier)}</span>
                                        <span className="font-bold text-white tabular-nums">{count}</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#D4AF37]/60 rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Commissioner by league size */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Commissioner Subs by League Size</p>
                    {bySize.size === 0 ? (
                        <p className="text-gray-600 text-sm">No commissioner subscriptions yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {Array.from(bySize.entries()).sort((a, b) => a[0] - b[0]).map(([size, count]) => {
                                const total = commSubs.length || 1;
                                return (
                                    <div key={size}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm text-gray-300">{size}-Team</span>
                                            <span className="font-bold text-white tabular-nums">{count}</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500/50 rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Recent subscriptions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-semibold text-white">Recent Subscriptions</p>
                        <p className="text-xs text-gray-600">Last 30 events</p>
                    </div>
                </div>
                <div className="divide-y divide-gray-800">
                    {recentSubs.map(s => {
                        const statusColor = s.status === 'active' ? 'text-emerald-400' : s.status === 'trialing' ? 'text-blue-400' : s.status === 'canceled' ? 'text-red-400' : 'text-gray-500';
                        return (
                            <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-white">{tierLabel(s.tier)}</p>
                                    <p className="text-xs text-gray-600 truncate">
                                        {s.leagueName ?? 'Player Plan'}
                                        {s.leagueSize ? ` · ${s.leagueSize} teams` : ''}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 text-right">
                                    <span className={`text-xs font-semibold ${statusColor}`}>{s.status}</span>
                                    <span className="text-[10px] text-gray-600 tabular-nums">
                                        {new Date(s.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Balance Breakdown ─────────────────────────────────────────── */}
            <div>
                <h2 className="text-lg font-bold text-white mb-1">Stripe Balance Breakdown</h2>
                <p className="text-gray-500 text-sm mb-4">What&apos;s yours vs. what belongs to league winners.</p>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-3">
                    <StatCard label="Total Dues Collected" value={fmt(totalDuesCollected)} sub={`${totalPaidMembers} Stripe txns (${selfPayCount} self · ${stripeOnBehalfCount} on-behalf · ${futureDuesStripeCount} future)`} />
                    <StatCard label="Already Paid Out"     value={fmt(alreadyPaidOut)}     sub="Sent to winners" />
                    <StatCard label="Pending Payouts"      value={fmt(pendingPayouts)}      sub="Winners set, not paid" />
                    <StatCard label="Gross Escrow"         value={fmt(stillInEscrow)}       sub="Before fees" />
                    <StatCard label="Est. Stripe Fees"     value={fmt(estStripeFees)}       sub={`2.9% + $0.30 × ${totalPaidMembers} paid txns`} />
                    <StatCard label="Est. Payout Fees"     value={fmt(estPayoutFees)}       sub="1.5% of gross escrow" />
                </div>

                <div className="bg-gray-900 border border-[#D4AF37]/30 rounded-xl px-5 py-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Net Escrow After All Fees</p>
                            <p className="text-2xl font-black text-[#D4AF37] tabular-nums">{fmt(netEscrowAfterFees)}</p>
                            <p className="text-xs text-gray-600 mt-1">Gross escrow − Stripe processing − pending payout fees</p>
                        </div>
                        <div className="text-right text-xs text-gray-600 space-y-1">
                            <p>Gross: <span className="text-gray-400 font-medium">{fmt(stillInEscrow)}</span></p>
                            <p>Processing: <span className="text-red-400 font-medium">−{fmt(estStripeFees)}</span></p>
                            <p>Payout fees: <span className="text-red-400 font-medium">−{fmt(estPayoutFees)}</span></p>
                        </div>
                    </div>
                </div>

                <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl px-5 py-4 mb-6 text-sm text-amber-300">
                    <span className="font-bold">Safe to transfer out of Stripe:</span>{' '}
                    subscription revenue only. Leave <span className="font-bold">{fmt(stillInEscrow)}</span> in Stripe until all payouts clear — Stripe deducts fees automatically from the balance.
                </div>

                {/* Per-league escrow table */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800">
                        <p className="text-sm font-semibold text-white">Escrow by League</p>
                        <p className="text-xs text-gray-600">How much of the pot each league still holds</p>
                    </div>
                    <div className="divide-y divide-gray-800">
                        {leaguesWithDues.map(league => {
                            const paid    = league.winners.filter(w => w.paidOut).reduce((s, w) => s + w.amount, 0);
                            const pending = league.winners.filter(w => !w.paidOut).reduce((s, w) => s + w.amount, 0);
                            const held    = league.potTotal - paid;
                            const statusColor =
                                league.status === 'paid_out'  ? 'text-emerald-400' :
                                league.status === 'approved'  ? 'text-blue-400'    :
                                league.status === 'active'    ? 'text-[#D4AF37]'   : 'text-gray-500';
                            return (
                                <div key={league.id} className="px-5 py-3 flex items-center justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-white">{league.leagueName}</p>
                                        <p className="text-xs text-gray-600">
                                            Season {league.season} · {fmt(league.buyInAmount)} buy-in · {league._count.members} members
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0 text-right">
                                        <div>
                                            <p className="text-xs text-gray-500">Collected</p>
                                            <p className="text-sm font-bold text-white tabular-nums">{fmt(league.potTotal)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Held</p>
                                            <p className="text-sm font-bold tabular-nums" style={{ color: held > 0 ? '#D4AF37' : '#6b7280' }}>{fmt(held)}</p>
                                        </div>
                                        {pending > 0 && (
                                            <div>
                                                <p className="text-xs text-gray-500">Pending</p>
                                                <p className="text-sm font-bold text-blue-400 tabular-nums">{fmt(pending)}</p>
                                            </div>
                                        )}
                                        <span className={`text-xs font-semibold ${statusColor}`}>{league.status.replace(/_/g, ' ')}</span>
                                    </div>
                                </div>
                            );
                        })}
                        {leaguesWithDues.length === 0 && (
                            <p className="px-5 py-4 text-sm text-gray-600">No leagues with dues yet.</p>
                        )}
                    </div>
                </div>
            </div>

            <p className="text-[11px] text-gray-700">
                * ARR = commissioner plan + player plan revenue (Pro $9.99 · All-Pro $24.99 · Elite $44.99/yr). MRR = ARR ÷ 12. Subscription Stripe fee estimate uses full plan price — ELITE100 subs are billed $0 so actual fees are lower. Dues fee: 2.9% + $0.30/paid txn. Payout fee: 1.5% of gross escrow. Verify exact amounts in Stripe Dashboard.
            </p>
        </div>
    );
}
