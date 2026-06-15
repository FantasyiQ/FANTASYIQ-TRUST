export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

// ── Pricing tables ────────────────────────────────────────────────────────────

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
    const idx    = TIER_INDEX[tier] ?? 0;
    const prices = COMM_PRICES[leagueSize as TeamSize];
    return prices ? prices[idx] : 0;
}

const PLAYER_PRICES: Record<string, number> = {
    PLAYER_PRO: 9.99, PLAYER_ALL_PRO: 24.99, PLAYER_ELITE: 44.99,
};
function playerPrice(tier: string): number { return PLAYER_PRICES[tier] ?? 0; }

// ── Module-level formatters ───────────────────────────────────────────────────

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmt2(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ── UI primitives ─────────────────────────────────────────────────────────────

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

/** A step box in a waterfall flow */
function FlowBox({ label, amount, sublabel, variant }: {
    label: string; amount: string; sublabel?: string;
    variant: 'start' | 'mid' | 'gold';
}) {
    const border = variant === 'gold' ? 'border-[#D4AF37]/40 bg-[#D4AF37]/5'
                 : variant === 'mid'  ? 'border-gray-800 bg-gray-900/60'
                 :                      'border-gray-600 bg-gray-900';
    const text   = variant === 'gold' ? 'text-[#D4AF37]'
                 : variant === 'mid'  ? 'text-gray-300'
                 :                      'text-white';
    const lbl    = variant === 'gold' ? 'text-[#D4AF37]/60'
                 : variant === 'mid'  ? 'text-gray-600'
                 :                      'text-gray-400';
    return (
        <div className={`border-2 rounded-xl p-5 ${border}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-widest mb-2 ${lbl}`}>{label}</p>
            <p className={`text-4xl font-black tabular-nums ${text}`}>{amount}</p>
            {sublabel && <p className="text-xs text-gray-500 mt-2">{sublabel}</p>}
        </div>
    );
}

/** Connector row between two FlowBoxes — shows a deduction with formula */
function FlowDeduction({ label, formula, amount }: {
    label: string; formula: string; amount: string;
}) {
    return (
        <div className="flex flex-col items-center">
            <div style={{ width: 2, height: 20, background: '#374151' }} />
            <div className="w-full border border-red-900/40 bg-red-950/20 rounded-xl px-5 py-3 flex items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-bold text-red-400 uppercase tracking-wide">{label}</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">{formula}</p>
                </div>
                <p className="text-lg font-black text-red-400 tabular-nums shrink-0">−{amount}</p>
            </div>
            <div style={{ width: 2, height: 16, background: '#374151' }} />
            {/* arrowhead */}
            <div style={{ width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '9px solid #374151' }} />
        </div>
    );
}

function startOf(daysAgo: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
        stripeSubsPage,
    ] = await Promise.all([
        prisma.subscription.findMany({
            where:  { status: { in: ['active', 'trialing'] } },
            select: { tier: true, type: true, leagueSize: true, status: true, createdAt: true, stripeSubscriptionId: true },
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
        prisma.leagueDues.aggregate({ _sum: { potTotal: true } }),
        prisma.leagueWinner.groupBy({
            by:    ['paidOut'],
            _sum:  { amount: true },
            _count: { id: true },
        }),
        prisma.leagueDues.findMany({
            select: {
                id:          true,
                leagueName:  true,
                season:      true,
                status:      true,
                potTotal:    true,
                buyInAmount: true,
                teamCount:   true,
                winners:     { select: { amount: true, paidOut: true } },
                _count:      { select: { members: { where: { duesStatus: 'paid' } } } },
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.duesMember.count({ where: { paymentMethod: 'stripe_on_behalf' } }),
        prisma.futureDuesObligation.count({ where: { paymentMethod: 'stripe_on_behalf' } }),
        stripe.subscriptions.list({ status: 'all', limit: 100 }),
    ]);

    // ── Subscription math ────────────────────────────────────────────────────

    const elite100StripeIds = new Set(
        stripeSubsPage.data
            .filter(s => (s.discounts as { coupon?: { percent_off?: number; id?: string } }[])
                ?.some(d => (d.coupon?.percent_off ?? 0) >= 100 || d.coupon?.id === 'ELITE100'))
            .map(s => s.id)
    );
    const isElite100 = (id: string | null) => !id || elite100StripeIds.has(id);

    const paidActiveSubs = activeSubs.filter(s => !isElite100(s.stripeSubscriptionId));
    const freeActiveSubs = activeSubs.filter(s =>  isElite100(s.stripeSubscriptionId));
    const playerSubs     = activeSubs.filter(s => s.type === 'player');
    const commSubs       = activeSubs.filter(s => s.type === 'commissioner');

    // ARR/MRR: ELITE100 = $0 billed = $0 revenue — only count actually-charged subs
    const paidCommArr   = paidActiveSubs.filter(s => s.type === 'commissioner').reduce((sum, s) => sum + commPrice(s.tier, s.leagueSize), 0);
    const paidPlayerArr = paidActiveSubs.filter(s => s.type === 'player').reduce((sum, s) => sum + playerPrice(s.tier), 0);
    const paidArr       = paidCommArr + paidPlayerArr;
    const arr           = paidArr;       // alias for stat cards
    const mrr           = paidArr / 12;

    // List-price totals (informational only — not revenue until ELITE100 expires)
    const listCommArr  = commSubs.reduce((sum, s) => sum + commPrice(s.tier, s.leagueSize), 0);
    const listPlayerArr = playerSubs.reduce((sum, s) => sum + playerPrice(s.tier), 0);
    const listArr      = listCommArr + listPlayerArr;

    // Subscription Stripe fees: 2.9% + $0.30 per paid charge
    const estSubStripeFees = paidArr * 0.029 + paidActiveSubs.length * 0.30;
    const netSubRevenue    = paidArr - estSubStripeFees;

    // ── Dues math ────────────────────────────────────────────────────────────

    const totalDuesCollected = duesAgg._sum.potTotal ?? 0;
    const paidOutRow         = winnersAgg.find(r => r.paidOut === true);
    const pendingRow         = winnersAgg.find(r => r.paidOut === false);
    const alreadyPaidOut     = paidOutRow?._sum.amount ?? 0;
    const pendingPayouts     = pendingRow?._sum.amount ?? 0;
    const stillInEscrow      = totalDuesCollected - alreadyPaidOut;

    const selfPayCount      = leaguesWithDues.reduce((sum, l) => sum + l._count.members, 0);
    const totalPaidMembers  = selfPayCount + stripeOnBehalfCount + futureDuesStripeCount;

    // Stripe processing: 2.9% of gross + $0.30 per transaction
    const estStripeFees     = totalDuesCollected * 0.029 + totalPaidMembers * 0.30;
    // Stripe Connect payout fee: 1.5% on gross pot (charged at payout time)
    const totalPayoutFeeEst = totalDuesCollected * 0.015;
    const totalDuesExpenses = estStripeFees + totalPayoutFeeEst;
    const netToWinnersEst   = totalDuesCollected - totalDuesExpenses;
    // Remaining payout fees on escrow still held
    const estPayoutFees     = stillInEscrow * 0.015;

    // ── Breakdown maps ───────────────────────────────────────────────────────

    const byTier = new Map<string, number>();
    for (const s of activeSubs) byTier.set(s.tier, (byTier.get(s.tier) ?? 0) + 1);

    const bySize = new Map<number, number>();
    for (const s of commSubs) {
        if (s.leagueSize) bySize.set(s.leagueSize, (bySize.get(s.leagueSize) ?? 0) + 1);
    }

    function tierLabel(tier: string) {
        return tier.replace(/_/g, ' ').replace('COMMISSIONER', 'Comm').replace('PLAYER', 'Player').replace('ALL PRO', 'All-Pro').replace(/\b\w/g, c => c.toUpperCase());
    }

    const duesPct = totalDuesCollected > 0
        ? (totalDuesExpenses / totalDuesCollected * 100).toFixed(1)
        : '0.0';

    return (
        <div className="space-y-10">

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div>
                <h1 className="text-2xl font-black">Revenue</h1>
                <p className="text-gray-500 text-sm mt-1">Subscription analytics · dues flow · fee breakdown</p>
            </div>

            {/* ── Top stats ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Est. MRR"    value={fmt(mrr)}  sub="Billed annual ÷ 12" accent />
                <StatCard label="Est. ARR"    value={fmt(arr)}  sub={`${fmt(paidCommArr)} comm · ${fmt(paidPlayerArr)} player · paid only`} />
                <StatCard label="Active Subs" value={String(activeSubs.length)} sub={`${paidActiveSubs.length} paid · ${freeActiveSubs.length} ELITE100 ($0)`} />
                <StatCard label="New (30d)"   value={String(newSubsThisMonth)} sub={`${canceledThisMonth} canceled`} />
            </div>

            {/* ── SUBSCRIPTION REVENUE FLOW ─────────────────────────────────── */}
            <div>
                <h2 className="text-lg font-bold text-white mb-1">Subscription Revenue Flow</h2>
                <p className="text-gray-500 text-sm mb-5">
                    Annual billing · 2.9% + $0.30/charge · ELITE100 subs billed $0 (excluded from fee calc)
                </p>

                {/* 3-step horizontal flow */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-0 mb-4">

                    {/* Step 1: Billed ARR */}
                    <div className="border-2 border-gray-600 bg-gray-900 rounded-l-2xl p-6">
                        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest mb-3">Annual Billed</p>
                        <p className="text-4xl font-black text-white tabular-nums">{fmt2(paidArr)}</p>
                        <div className="mt-4 space-y-1.5 pt-4 border-t border-gray-800">
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Commissioner plans</span>
                                <span className="text-gray-300 font-semibold tabular-nums">{fmt2(paidCommArr)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Player plans</span>
                                <span className="text-gray-300 font-semibold tabular-nums">{fmt2(paidPlayerArr)}</span>
                            </div>
                            <div className="flex justify-between text-xs pt-1 border-t border-gray-800">
                                <span className="text-gray-600">{paidActiveSubs.length} paid sub{paidActiveSubs.length !== 1 ? 's' : ''}</span>
                                <span className="text-gray-600">{freeActiveSubs.length} ELITE100 @ $0</span>
                            </div>
                        </div>
                    </div>

                    {/* Arrow + fee */}
                    <div className="flex flex-col items-center justify-center px-4 gap-2">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 32, height: 2, background: '#991b1b' }} />
                            <div style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '9px solid #991b1b' }} />
                        </div>
                        <div className="bg-red-950/40 border border-red-900/40 rounded-xl px-4 py-3 text-center" style={{ minWidth: 120 }}>
                            <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">Stripe Fees</p>
                            <p className="text-2xl font-black text-red-400 tabular-nums">−{fmt2(estSubStripeFees)}</p>
                            <p className="text-[10px] text-gray-600 mt-1">2.9% + $0.30 × {paidActiveSubs.length}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 32, height: 2, background: '#991b1b' }} />
                            <div style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '9px solid #991b1b' }} />
                        </div>
                    </div>

                    {/* Step 3: Net Revenue */}
                    <div className="border-2 border-[#D4AF37]/50 bg-[#D4AF37]/5 rounded-r-2xl p-6">
                        <p className="text-[11px] text-[#D4AF37]/70 font-semibold uppercase tracking-widest mb-3">Net Revenue / yr</p>
                        <p className="text-4xl font-black text-[#D4AF37] tabular-nums">{fmt2(netSubRevenue)}</p>
                        <div className="mt-4 space-y-1.5 pt-4 border-t border-[#D4AF37]/20">
                            <div className="flex justify-between text-xs">
                                <span className="text-[#D4AF37]/50">Per month</span>
                                <span className="text-[#D4AF37]/80 font-semibold tabular-nums">{fmt2(netSubRevenue / 12)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-[#D4AF37]/50">Effective margin</span>
                                <span className="text-[#D4AF37]/80 font-semibold">
                                    {paidArr > 0 ? (netSubRevenue / paidArr * 100).toFixed(1) : '0.0'}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ELITE100 note — not revenue, just context */}
                {freeActiveSubs.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 flex items-center justify-between text-xs text-gray-500">
                        <span>
                            <span className="text-gray-400 font-semibold">{freeActiveSubs.length} ELITE100 sub{freeActiveSubs.length > 1 ? 's' : ''}</span>
                            {' '}active · $0 billed · $0 Stripe fees · not counted in revenue
                        </span>
                        <span className="text-gray-600">
                            List-price value if paid: <span className="text-gray-500">{fmt2(listArr)}</span>
                        </span>
                    </div>
                )}
            </div>

            {/* ── Tier + size breakdown ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

            {/* ── Recent subscriptions ──────────────────────────────────────── */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">Recent Subscriptions</p>
                    <p className="text-xs text-gray-600">Last 30 events</p>
                </div>
                <div className="divide-y divide-gray-800">
                    {recentSubs.map(s => {
                        const statusColor = s.status === 'active' ? 'text-emerald-400' : s.status === 'trialing' ? 'text-blue-400' : s.status === 'canceled' ? 'text-red-400' : 'text-gray-500';
                        return (
                            <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-white">{tierLabel(s.tier)}</p>
                                    <p className="text-xs text-gray-600 truncate">
                                        {s.leagueName ?? 'Player Plan'}{s.leagueSize ? ` · ${s.leagueSize} teams` : ''}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className={`text-xs font-semibold ${statusColor}`}>{s.status}</span>
                                    <span className="text-[10px] text-gray-600 tabular-nums">{new Date(s.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── LEAGUE DUES FLOW ──────────────────────────────────────────── */}
            <div>
                <h2 className="text-lg font-bold text-white mb-1">League Dues Flow</h2>
                <p className="text-gray-500 text-sm mb-6">
                    How the pot moves from members to winners — all fees come out of collected dues.
                </p>

                {/* Waterfall */}
                <div className="max-w-2xl">

                    <FlowBox
                        label="Gross Dues Collected"
                        amount={fmt2(totalDuesCollected)}
                        sublabel={`${totalPaidMembers} Stripe transactions · ${selfPayCount} self-pay · ${stripeOnBehalfCount} on-behalf · ${futureDuesStripeCount} future`}
                        variant="start"
                    />

                    <FlowDeduction
                        label="Stripe Processing Fee"
                        formula={`2.9% × ${fmt2(totalDuesCollected)} + $0.30 × ${totalPaidMembers} txns`}
                        amount={fmt2(estStripeFees)}
                    />

                    <FlowBox
                        label="After Stripe Processing"
                        amount={fmt2(totalDuesCollected - estStripeFees)}
                        variant="mid"
                    />

                    <FlowDeduction
                        label="Stripe Payout Fee (est.)"
                        formula={`1.5% × ${fmt2(totalDuesCollected)} gross pot · charged when funds transfer to winners`}
                        amount={fmt2(totalPayoutFeeEst)}
                    />

                    <FlowBox
                        label="Est. Net to Winners"
                        amount={fmt2(netToWinnersEst)}
                        sublabel={`After all Stripe fees · ${duesPct}% total fee rate on gross pot`}
                        variant="gold"
                    />
                </div>

                {/* Fee summary cards */}
                <div className="grid grid-cols-3 gap-3 max-w-2xl mt-6 mb-6">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Processing Fees</p>
                        <p className="text-2xl font-black text-red-400 tabular-nums">{fmt2(estStripeFees)}</p>
                        <p className="text-[10px] text-gray-600 mt-1.5">2.9% + $0.30 × {totalPaidMembers} txns</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Payout Fees (est.)</p>
                        <p className="text-2xl font-black text-red-400 tabular-nums">{fmt2(totalPayoutFeeEst)}</p>
                        <p className="text-[10px] text-gray-600 mt-1.5">1.5% of gross pot</p>
                    </div>
                    <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-red-400/70 font-semibold uppercase tracking-wider mb-2">Total Dues Expenses</p>
                        <p className="text-2xl font-black text-red-400 tabular-nums">{fmt2(totalDuesExpenses)}</p>
                        <p className="text-[10px] text-gray-600 mt-1.5">{duesPct}% of ${totalDuesCollected.toFixed(2)} pot</p>
                    </div>
                </div>

                {/* Escrow status */}
                <div className="max-w-2xl mb-6 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                        <StatCard label="In Escrow (Gross)" value={fmt(stillInEscrow)}  sub="Before remaining fees" />
                        <StatCard label="Already Paid Out"  value={fmt(alreadyPaidOut)} sub="Sent to winners" />
                        <StatCard label="Pending Payouts"   value={fmt(pendingPayouts)}  sub="Winners set, not yet paid" />
                    </div>

                    <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl px-5 py-4 text-sm text-amber-300">
                        <span className="font-bold">Safe to transfer out of Stripe:</span>{' '}
                        subscription revenue only. Leave <span className="font-bold">{fmt(stillInEscrow)}</span> in Stripe until all payouts clear
                        {stillInEscrow > 0 && ` — est. ${fmt2(estPayoutFees)} in remaining payout fees will be deducted automatically`}.
                    </div>
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
                                league.status === 'paid_out' ? 'text-emerald-400' :
                                league.status === 'approved' ? 'text-blue-400'    :
                                league.status === 'active'   ? 'text-[#D4AF37]'   : 'text-gray-500';
                            return (
                                <div key={league.id} className="px-5 py-3 flex items-center justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-white">{league.leagueName}</p>
                                        <p className="text-xs text-gray-600">
                                            Season {league.season} · {fmt(league.buyInAmount)} buy-in · {league._count.members} paid members
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
                * ARR = list-price value across all active subs (Year 2 potential when ELITE100 expires). Subscription fees apply to actually-billed subs only — ELITE100 = $0 invoice = $0 Stripe fee. Dues fees (processing + payout) come out of the pot; FiQ does not pay them. Verify exact amounts in Stripe Dashboard.
            </p>
        </div>
    );
}
