export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

function fmt2(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

function PctBar({ pct, color }: { pct: number; color: string }) {
    return (
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

export default async function AdminDuesPage() {
    const leagues = await prisma.leagueDues.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id:          true,
            leagueName:  true,
            season:      true,
            status:      true,
            buyInAmount: true,
            teamCount:   true,
            potTotal:    true,
            deadline:    true,
            createdAt:   true,
            members: {
                select: {
                    duesStatus:    true,
                    paymentMethod: true,
                    createdAt:     true,
                    updatedAt:     true,
                },
            },
        },
    });

    // Compute per-league stats
    const leagueStats = leagues.map(l => {
        const total   = l.members.length;
        const paid    = l.members.filter(m => m.duesStatus === 'paid').length;
        const unpaid  = l.members.filter(m => m.duesStatus === 'unpaid').length;
        const manual  = l.members.filter(m => m.duesStatus === 'paid' && m.paymentMethod === 'manual').length;
        const stripe  = paid - manual;
        const pct     = total > 0 ? Math.round((paid / total) * 100) : 0;
        const expectedPot = l.buyInAmount * total;
        const gap     = expectedPot - l.potTotal;

        // Time to first payment: diff between league creation and first paid member
        const paidMembers = l.members.filter(m => m.duesStatus === 'paid').sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        const firstPaidAt = paidMembers[0]?.updatedAt ?? null;
        const lastPaidAt  = paidMembers[paidMembers.length - 1]?.updatedAt ?? null;
        const ttfpMs      = firstPaidAt ? firstPaidAt.getTime() - l.createdAt.getTime() : null;
        const ttfpDays    = ttfpMs !== null ? Math.round(ttfpMs / 86_400_000) : null;

        return { ...l, total, paid, unpaid, manual, stripe, pct, expectedPot, gap, firstPaidAt, lastPaidAt, ttfpDays };
    });

    // Platform-wide rollups
    const totalLeagues      = leagues.length;
    const activeLeagues     = leagueStats.filter(l => l.status === 'active');
    const fullCollect       = leagueStats.filter(l => l.pct === 100).length;
    const avgCollection     = leagueStats.length > 0
        ? Math.round(leagueStats.reduce((s, l) => s + l.pct, 0) / leagueStats.length) : 0;
    const totalPot          = leagueStats.reduce((s, l) => s + l.potTotal, 0);
    const totalExpected     = leagueStats.reduce((s, l) => s + l.expectedPot, 0);
    const totalUnpaid       = leagueStats.reduce((s, l) => s + l.unpaid, 0);
    const avgTtfp           = (() => {
        const vals = leagueStats.filter(l => l.ttfpDays !== null).map(l => l.ttfpDays!);
        return vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    })();

    // Stragglers: active leagues missing at least 1 payment
    const stragglers = activeLeagues.filter(l => l.unpaid > 0).sort((a, b) => b.unpaid - a.unpaid);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Dues Flow Completion</h1>
                <p className="text-gray-500 text-sm mt-1">Collection rates · stragglers · time to first payment</p>
            </div>

            {/* Top stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Leagues',     value: totalLeagues,                         sub: `${fullCollect} fully collected` },
                    { label: 'Avg Collection',    value: `${avgCollection}%`,                  sub: `${totalPot > 0 ? fmt2(totalPot) : '$0'} of ${fmt2(totalExpected)}` },
                    { label: 'Unpaid Members',    value: totalUnpaid,                          sub: totalUnpaid > 0 ? 'across active leagues' : 'all collected!' },
                    { label: 'Avg Days to 1st $', value: avgTtfp !== null ? `${avgTtfp}d` : '—', sub: 'setup → first payment' },
                ].map(card => (
                    <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{card.label}</p>
                        <p className={`text-3xl font-black tabular-nums ${card.label === 'Unpaid Members' && totalUnpaid > 0 ? 'text-amber-400' : 'text-white'}`}>
                            {card.value}
                        </p>
                        {card.sub && <p className="text-xs text-gray-600">{card.sub}</p>}
                    </div>
                ))}
            </div>

            {/* Stragglers */}
            {stragglers.length > 0 && (
                <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-amber-800/30">
                        <p className="text-sm font-semibold text-amber-300">Active Leagues with Unpaid Members</p>
                        <p className="text-xs text-amber-500/70">{stragglers.length} league{stragglers.length !== 1 ? 's' : ''} still collecting</p>
                    </div>
                    <div className="divide-y divide-amber-900/20">
                        {stragglers.map(l => (
                            <div key={l.id} className="px-5 py-3 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white">{l.leagueName}</p>
                                    <p className="text-xs text-gray-600">
                                        Season {l.season} · {fmt2(l.buyInAmount)} buy-in
                                        {l.deadline ? ` · deadline ${new Date(l.deadline).toLocaleDateString()}` : ' · no deadline'}
                                    </p>
                                    <PctBar pct={l.pct} color="bg-amber-500/60" />
                                </div>
                                <div className="text-right shrink-0 space-y-0.5">
                                    <p className="text-sm font-bold text-amber-400">{l.paid}/{l.total} paid</p>
                                    <p className="text-xs text-red-400">{l.unpaid} still owe {fmt2(l.buyInAmount)} each</p>
                                    <p className="text-[11px] text-gray-600 tabular-nums">pot: {fmt2(l.potTotal)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* All leagues table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">All Leagues</p>
                    <p className="text-xs text-gray-600">Collection rate, payment method breakdown, time to first payment</p>
                </div>
                {leagues.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-600">No leagues with dues yet.</p>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {leagueStats.map(l => {
                            const barColor = l.pct === 100 ? 'bg-emerald-500/60' : l.pct >= 75 ? 'bg-[#D4AF37]/60' : 'bg-red-500/50';
                            const statusColor =
                                l.status === 'paid_out' ? 'text-emerald-400' :
                                l.status === 'approved' ? 'text-blue-400'    :
                                l.status === 'active'   ? 'text-[#D4AF37]'   : 'text-gray-500';
                            return (
                                <div key={l.id} className="px-5 py-3 flex items-center gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm text-white">{l.leagueName}</p>
                                            <span className={`text-[10px] font-semibold ${statusColor}`}>{l.status.replace(/_/g, ' ')}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-600">
                                            Season {l.season} · {fmt2(l.buyInAmount)} buy-in · {l.stripe} stripe · {l.manual} cash
                                            {l.ttfpDays !== null ? ` · ${l.ttfpDays}d to first $` : ''}
                                            {l.firstPaidAt ? ` · first paid ${timeAgo(l.firstPaidAt)}` : ''}
                                        </p>
                                        <PctBar pct={l.pct} color={barColor} />
                                    </div>
                                    <div className="text-right shrink-0 space-y-0.5">
                                        <p className="text-sm font-bold text-white tabular-nums">{l.pct}%</p>
                                        <p className="text-xs text-gray-500 tabular-nums">{l.paid}/{l.total} paid</p>
                                        <p className="text-xs text-gray-600 tabular-nums">{fmt2(l.potTotal)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
