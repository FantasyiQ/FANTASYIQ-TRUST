export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { getActivationFunnel, STAGE_LABELS } from '@/lib/commissioner-activation';

function startOf(daysAgo: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-black text-white tabular-nums">{value}</p>
            {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
    );
}

export default async function AdminCommissionersPage() {
    const [
        activeCommSubs,
        newCommSubsMonth,
        lfCommissionerCount,
        lfLeagueCount,
        reviewCount,
        duesTrackers,
        recentCommSubs,
        topCommTiers,
        activationFunnel,
    ] = await Promise.all([
        prisma.subscription.count({
            where: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
        }),
        prisma.subscription.count({
            where: { type: 'commissioner', status: { in: ['active', 'trialing'] }, createdAt: { gte: startOf(30) } },
        }),
        prisma.lFCommissioner.count(),
        prisma.lFLeague.count(),
        prisma.lFReview.count(),
        prisma.leagueDues.count({ where: { status: { notIn: ['setup'] } } }),
        prisma.subscription.findMany({
            where:   { type: 'commissioner' },
            orderBy: { createdAt: 'desc' },
            take:    30,
            select:  {
                id: true, tier: true, leagueSize: true, leagueName: true,
                status: true, createdAt: true,
                user: { select: { email: true } },
            },
        }),
        prisma.subscription.groupBy({
            by:    ['tier'],
            where: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
            _count: { _all: true },
        }),
        getActivationFunnel(),
    ]);

    function tierLabel(tier: string) {
        return tier.replace('COMMISSIONER_', '').replace('_', '-').replace(/\b\w/g, c => c.toUpperCase());
    }

    const statusColors: Record<string, string> = {
        active:   'text-emerald-400',
        trialing: 'text-blue-400',
        canceled: 'text-red-400',
        inactive: 'text-gray-500',
        past_due: 'text-amber-400',
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Commissioners</h1>
                <p className="text-gray-500 text-sm mt-1">Commissioner subscriptions and LeagueFinder activity</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Active Comm Subs"  value={activeCommSubs}    sub={`${newCommSubsMonth} new this month`} />
                <StatCard label="LF Commissioners"  value={lfCommissionerCount} sub="LeagueFinder profiles" />
                <StatCard label="LF Leagues Listed" value={lfLeagueCount}     sub={`${reviewCount} reviews`} />
                <StatCard label="Dues Trackers"     value={duesTrackers}      sub="active + completed" />
            </div>

            {/* Activation funnel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Activation Funnel</p>
                <div className="space-y-3">
                    {activationFunnel.map((row, i) => {
                        const topCount = activationFunnel[0].count;
                        const pct      = topCount > 0 ? Math.round((row.count / topCount) * 100) : 0;
                        const dropPct  = i > 0 && activationFunnel[i - 1].count > 0
                            ? Math.round(((activationFunnel[i - 1].count - row.count) / activationFunnel[i - 1].count) * 100)
                            : 0;
                        return (
                            <div key={row.stage}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-gray-300">{STAGE_LABELS[row.stage]}</span>
                                    <div className="flex items-center gap-2">
                                        {i > 0 && dropPct > 0 && (
                                            <span className="text-[10px] text-red-400 tabular-nums">-{dropPct}%</span>
                                        )}
                                        <span className="font-bold text-white tabular-nums">{row.count.toLocaleString()}</span>
                                        <span className="text-gray-600 text-xs tabular-nums">({pct}%)</span>
                                    </div>
                                </div>
                                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-[#D4AF37]/60"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Commissioner tier breakdown */}
            {topCommTiers.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Active Subs by Tier</p>
                    <div className="flex gap-4 flex-wrap">
                        {topCommTiers.sort((a, b) => b._count._all - a._count._all).map(t => (
                            <div key={t.tier} className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 text-center min-w-[100px]">
                                <p className="text-2xl font-black text-white tabular-nums">{t._count._all}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{tierLabel(t.tier)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent commissioner subscriptions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">Recent Commissioner Subscriptions</p>
                    <p className="text-xs text-gray-600">Last 30 records</p>
                </div>
                <div className="divide-y divide-gray-800">
                    {recentCommSubs.map(s => (
                        <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-white truncate">{s.leagueName ?? '—'}</p>
                                <p className="text-xs text-gray-600 truncate">{s.user.email}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-right">
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-gray-300">
                                        {tierLabel(s.tier)}
                                        {s.leagueSize ? ` · ${s.leagueSize}T` : ''}
                                    </p>
                                    <p className={`text-[10px] ${statusColors[s.status] ?? 'text-gray-500'}`}>{s.status}</p>
                                </div>
                                <span className="text-[10px] text-gray-600 tabular-nums whitespace-nowrap">
                                    {new Date(s.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
