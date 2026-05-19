export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { getFeatureIntelligenceSummary } from '@/lib/feature-intelligence';
import type { TrendDirection } from '@/lib/feature-intelligence';

function startOf(daysAgo: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
}

const DIRECTION_STYLES: Record<TrendDirection, { badge: string; symbol: string }> = {
    rising:   { badge: 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400', symbol: '▲' },
    stable:   { badge: 'bg-gray-800 border-gray-700 text-gray-500',               symbol: '—' },
    declining:{ badge: 'bg-amber-900/30 border-amber-700/40 text-amber-400',       symbol: '▼' },
    abandoned:{ badge: 'bg-red-900/30 border-red-700/40 text-red-400',             symbol: '✕' },
    new:      { badge: 'bg-blue-900/30 border-blue-700/40 text-blue-400',          symbol: '★' },
};

export default async function AdminFeaturesPage() {
    const [
        totalEvents,
        eventsToday,
        eventsWeek,
        byFeature30d,
        recentEvents,
        uniqueUsersThisWeek,
        intelligence,
    ] = await Promise.all([
        prisma.featureUsageEvent.count(),
        prisma.featureUsageEvent.count({ where: { createdAt: { gte: startOf(0) } } }),
        prisma.featureUsageEvent.count({ where: { createdAt: { gte: startOf(7) } } }),
        prisma.featureUsageEvent.groupBy({
            by:      ['feature'],
            where:   { createdAt: { gte: startOf(30) } },
            _count:  { _all: true },
            orderBy: { _count: { feature: 'desc' } },
        }),
        prisma.featureUsageEvent.findMany({
            orderBy: { createdAt: 'desc' },
            take:    50,
            select:  { feature: true, createdAt: true, userId: true },
        }),
        prisma.featureUsageEvent.findMany({
            where:    { createdAt: { gte: startOf(7) } },
            select:   { userId: true },
            distinct: ['userId'],
        }),
        getFeatureIntelligenceSummary(),
    ]);

    const wau        = uniqueUsersThisWeek.length;
    const trendMap   = new Map(intelligence.trends.map(t => [t.feature, t]));

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Feature Usage</h1>
                <p className="text-gray-500 text-sm mt-1">What users are actually doing in FiQ</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Events',  value: totalEvents.toLocaleString() },
                    { label: 'Today',         value: eventsToday },
                    { label: 'This Week',     value: eventsWeek },
                    { label: 'WAU',           value: wau, sub: 'weekly active users' },
                ].map(({ label, value, sub }) => (
                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
                        <p className="text-3xl font-black text-white tabular-nums">{value}</p>
                        {sub && <p className="text-xs text-gray-600">{sub}</p>}
                    </div>
                ))}
            </div>

            {totalEvents === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                    <p className="text-2xl mb-3">📭</p>
                    <p className="font-semibold text-white">No feature events yet</p>
                    <p className="text-gray-500 text-sm mt-1">
                        Instrument your first feature using the{' '}
                        <code className="text-[#D4AF37] bg-black/40 px-1 rounded">trackFeature()</code> server action.
                    </p>
                </div>
            ) : (
                <>
                    {/* Intelligence alerts */}
                    {(intelligence.rising.length > 0 || intelligence.declining.length > 0 || intelligence.abandoned.length > 0) && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            {intelligence.rising.length > 0 && (
                                <div className="bg-emerald-900/10 border border-emerald-700/30 rounded-xl px-4 py-3">
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1.5">Rising (WoW ≥ +40%)</p>
                                    <div className="flex flex-wrap gap-1">
                                        {intelligence.rising.map(t => (
                                            <span key={t.feature} className="text-xs font-mono bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 px-1.5 py-0.5 rounded">
                                                {t.feature}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {intelligence.declining.length > 0 && (
                                <div className="bg-amber-900/10 border border-amber-700/30 rounded-xl px-4 py-3">
                                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1.5">Declining (WoW ≤ -30%)</p>
                                    <div className="flex flex-wrap gap-1">
                                        {intelligence.declining.map(t => (
                                            <span key={t.feature} className="text-xs font-mono bg-amber-900/30 border border-amber-700/40 text-amber-400 px-1.5 py-0.5 rounded">
                                                {t.feature}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {intelligence.abandoned.length > 0 && (
                                <div className="bg-red-900/10 border border-red-700/30 rounded-xl px-4 py-3">
                                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1.5">Abandoned (0 events this week)</p>
                                    <div className="flex flex-wrap gap-1">
                                        {intelligence.abandoned.map(t => (
                                            <span key={t.feature} className="text-xs font-mono bg-red-900/30 border border-red-700/40 text-red-400 px-1.5 py-0.5 rounded">
                                                {t.feature}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* WoW trend table */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-white">Feature Trends</p>
                                <p className="text-xs text-gray-600">Week-over-week comparison</p>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] text-gray-600">
                                <span className="tabular-nums">
                                    {intelligence.totalSuggestions} suggestions sent · {intelligence.readRate}% read
                                </span>
                            </div>
                        </div>
                        <div className="divide-y divide-gray-800">
                            {intelligence.trends.map(t => {
                                const s = DIRECTION_STYLES[t.direction];
                                return (
                                    <div key={t.feature} className="px-5 py-3 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${s.badge}`}>
                                                {s.symbol}
                                            </span>
                                            <span className="text-sm text-gray-300 font-mono truncate">{t.feature}</span>
                                        </div>
                                        <div className="flex items-center gap-4 shrink-0 text-right">
                                            <div className="text-right">
                                                <p className="text-xs text-gray-600 tabular-nums">
                                                    {t.lastWeek} → <span className="text-white font-semibold">{t.thisWeek}</span>
                                                </p>
                                                <p className={`text-[10px] tabular-nums font-semibold ${
                                                    t.deltaAbs > 0 ? 'text-emerald-400' :
                                                    t.deltaAbs < 0 ? 'text-red-400' :
                                                    'text-gray-600'
                                                }`}>
                                                    {t.deltaAbs > 0 ? '+' : ''}{t.deltaAbs}
                                                    {t.deltaPct !== null ? ` (${t.deltaPct > 0 ? '+' : ''}${t.deltaPct}%)` : ''}
                                                </p>
                                            </div>
                                            <span className="text-[10px] text-gray-600 tabular-nums w-16 text-right">
                                                {t.uniqueUsersThisWeek} users
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 30-day usage bars */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Feature Usage — Last 30 Days</p>
                        <div className="space-y-3">
                            {byFeature30d.map((f, i) => {
                                const top   = byFeature30d[0]._count._all || 1;
                                const trend = trendMap.get(f.feature);
                                return (
                                    <div key={f.feature}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm text-gray-300 font-mono">{f.feature}</span>
                                            <div className="flex items-center gap-2">
                                                {trend && trend.deltaPct !== null && (
                                                    <span className={`text-[10px] tabular-nums ${trend.deltaAbs >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {trend.deltaAbs >= 0 ? '+' : ''}{trend.deltaPct}% WoW
                                                    </span>
                                                )}
                                                <span className="font-bold text-white tabular-nums">{f._count._all}</span>
                                            </div>
                                        </div>
                                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${i === 0 ? 'bg-[#D4AF37]' : 'bg-[#D4AF37]/40'}`}
                                                style={{ width: `${(f._count._all / top) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Recent events */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800">
                            <p className="text-sm font-semibold text-white">Recent Events</p>
                        </div>
                        <div className="divide-y divide-gray-800">
                            {recentEvents.map((e, i) => (
                                <div key={i} className="px-5 py-2.5 flex items-center justify-between gap-4">
                                    <span className="text-sm text-gray-300 font-mono">{e.feature}</span>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[10px] text-gray-600 font-mono">{e.userId.slice(0, 8)}…</span>
                                        <span className="text-[10px] text-gray-600 tabular-nums whitespace-nowrap">
                                            {new Date(e.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
