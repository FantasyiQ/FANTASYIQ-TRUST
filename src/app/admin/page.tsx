export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENT_YEAR = String(new Date().getFullYear());
const LAST_YEAR    = String(new Date().getFullYear() - 1);

function startOf(daysAgo: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
}

function StatCard({ label, value, sub, accent }: {
    label: string; value: string | number; sub?: string; accent?: boolean;
}) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
            <p className={`text-3xl font-black tabular-nums ${accent ? 'text-[#D4AF37]' : 'text-white'}`}>
                {value}
            </p>
            {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
    );
}

// ── Mini bar chart (CSS only) ─────────────────────────────────────────────────

function MiniBarChart({ data, label }: {
    data: { date: string; count: number }[];
    label: string;
}) {
    const max = Math.max(...data.map(d => d.count), 1);
    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400">{label}</p>
            <div className="flex items-end gap-1 h-16">
                {data.map(d => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-0.5 group" title={`${d.date}: ${d.count}`}>
                        <div
                            className="w-full bg-[#D4AF37]/60 group-hover:bg-[#D4AF37] rounded-sm transition-colors min-h-[2px]"
                            style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex justify-between text-[9px] text-gray-700">
                <span>{data[0]?.date}</span>
                <span>{data[data.length - 1]?.date}</span>
            </div>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminOverviewPage() {
    const [
        totalUsers,
        newUsersToday,
        newUsersThisWeek,
        newUsersThisMonth,
        activeSubCount,
        commSubCount,
        totalLeagues,
        leaguesSyncedToday,
        leaguesThisYear,
        leaguesLastYear,
        recentUsers30d,
        platformBreakdown,
        platformBreakdownThisYear,
        subsByStatus,
        topFeatures,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: startOf(0) } } }),
        prisma.user.count({ where: { createdAt: { gte: startOf(7) } } }),
        prisma.user.count({ where: { createdAt: { gte: startOf(30) } } }),
        prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
        prisma.subscription.count({ where: { type: 'commissioner', status: { in: ['active', 'trialing'] } } }),
        prisma.league.count(),
        prisma.league.count({ where: { lastSyncedAt: { gte: startOf(0) } } }),
        prisma.league.count({ where: { season: CURRENT_YEAR } }),
        prisma.league.count({ where: { season: LAST_YEAR } }),
        // New users per day last 14 days
        prisma.user.findMany({
            where:   { createdAt: { gte: startOf(13) } },
            select:  { createdAt: true },
            orderBy: { createdAt: 'asc' },
        }),
        // Leagues by platform (all time)
        prisma.league.groupBy({ by: ['platform'], _count: { _all: true } }),
        // Leagues by platform (current year)
        prisma.league.groupBy({ by: ['platform'], where: { season: CURRENT_YEAR }, _count: { _all: true } }),
        // Subs by status
        prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
        // Top features last 30 days
        prisma.featureUsageEvent.groupBy({
            by:      ['feature'],
            where:   { createdAt: { gte: startOf(30) } },
            _count:  { _all: true },
            orderBy: { _count: { feature: 'desc' } },
            take:    5,
        }),
    ]);

    // Build daily new-user chart data (last 14 days)
    const dayMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
        const d = startOf(i);
        dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const u of recentUsers30d) {
        const key = u.createdAt.toISOString().slice(0, 10);
        dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const chartData = Array.from(dayMap.entries()).map(([date, count]) => ({
        date: date.slice(5), // MM-DD
        count,
    }));

    const platformData         = Object.fromEntries(platformBreakdown.map(p => [p.platform, p._count._all]));
    const platformDataThisYear = Object.fromEntries(platformBreakdownThisYear.map(p => [p.platform, p._count._all]));
    const yoyChange = leaguesLastYear > 0
        ? Math.round(((leaguesThisYear - leaguesLastYear) / leaguesLastYear) * 100)
        : null;
    const activeByStatus = Object.fromEntries(subsByStatus.map(s => [s.status, s._count._all]));

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Overview</h1>
                <p className="text-gray-500 text-sm mt-1">FiQ Internal Data System — live data</p>
            </div>

            {/* ── Top stats ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Users"       value={totalUsers.toLocaleString()} accent />
                <StatCard label="Active Subs"       value={activeSubCount} sub={`${commSubCount} commissioner`} />
                <StatCard label={`${CURRENT_YEAR} Leagues`} value={leaguesThisYear.toLocaleString()} sub={yoyChange !== null ? `${yoyChange >= 0 ? '+' : ''}${yoyChange}% vs ${LAST_YEAR} · ${totalLeagues} all-time` : `${leaguesSyncedToday} synced today`} accent />
                <StatCard label="New Today"         value={newUsersToday} sub={`${newUsersThisWeek} this week`} />
            </div>

            {/* ── Growth chart ───────────────────────────────────────────── */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <MiniBarChart data={chartData} label="New Users — Last 14 Days" />
            </div>

            {/* ── Breakdowns ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* User growth */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">User Growth</p>
                    {[
                        { label: 'Today',        count: newUsersToday     },
                        { label: 'Last 7 days',  count: newUsersThisWeek  },
                        { label: 'Last 30 days', count: newUsersThisMonth },
                        { label: 'All time',     count: totalUsers        },
                    ].map(({ label, count }) => (
                        <div key={label} className="flex items-center justify-between">
                            <span className="text-sm text-gray-400">{label}</span>
                            <span className="font-bold text-white tabular-nums">{count.toLocaleString()}</span>
                        </div>
                    ))}
                </div>

                {/* Leagues by platform */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Leagues by Platform</p>
                        <div className="flex gap-3 text-[10px] text-gray-600">
                            <span>{CURRENT_YEAR}</span>
                            <span>All-time</span>
                        </div>
                    </div>
                    {(['sleeper', 'espn', 'yahoo'] as const).map(platform => {
                        const total     = platformData[platform] ?? 0;
                        const thisYear  = platformDataThisYear[platform] ?? 0;
                        const barMax    = totalLeagues || 1;
                        return (
                            <div key={platform}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-gray-400 capitalize">{platform}</span>
                                    <div className="flex gap-4 tabular-nums">
                                        <span className="font-bold text-[#D4AF37]">{thisYear}</span>
                                        <span className="font-bold text-white">{total}</span>
                                    </div>
                                </div>
                                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#D4AF37]/60 rounded-full"
                                        style={{ width: `${(total / barMax) * 100}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                    <div className="pt-1 border-t border-gray-800 flex items-center justify-between text-xs">
                        <span className="text-gray-500">Year-over-year</span>
                        <span className={`font-bold ${yoyChange !== null && yoyChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {yoyChange !== null ? `${yoyChange >= 0 ? '+' : ''}${yoyChange}% vs ${LAST_YEAR}` : '—'}
                        </span>
                    </div>
                </div>

                {/* Subscription status */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Subscriptions</p>
                    {[
                        { key: 'active',    label: 'Active',     color: 'text-emerald-400' },
                        { key: 'trialing',  label: 'Trialing',   color: 'text-blue-400' },
                        { key: 'past_due',  label: 'Past Due',   color: 'text-amber-400' },
                        { key: 'canceled',  label: 'Canceled',   color: 'text-gray-500' },
                        { key: 'inactive',  label: 'Inactive',   color: 'text-gray-600' },
                    ].map(({ key, label, color }) => (
                        <div key={key} className="flex items-center justify-between">
                            <span className={`text-sm ${color}`}>{label}</span>
                            <span className="font-bold text-white tabular-nums">{activeByStatus[key] ?? 0}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Top features ───────────────────────────────────────────── */}
            {topFeatures.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Top Features (Last 30 Days)</p>
                    <div className="space-y-2">
                        {topFeatures.map(f => {
                            const top = topFeatures[0]._count._all || 1;
                            return (
                                <div key={f.feature}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm text-gray-300 font-mono">{f.feature}</span>
                                        <span className="text-sm font-bold text-white tabular-nums">{f._count._all}</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#D4AF37]/50 rounded-full" style={{ width: `${(f._count._all / top) * 100}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
