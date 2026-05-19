export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { getSyncFailureSummary } from '@/lib/sync-recovery';

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

export default async function AdminLeaguesPage() {
    const [
        totalLeagues,
        leaguesToday,
        leaguesWeek,
        byPlatform,
        byStatus,
        recentLeagues,
        staleLeagues,
        syncFailures,
    ] = await Promise.all([
        prisma.league.count(),
        prisma.league.count({ where: { lastSyncedAt: { gte: startOf(0) } } }),
        prisma.league.count({ where: { lastSyncedAt: { gte: startOf(7) } } }),
        prisma.league.groupBy({ by: ['platform'],    _count: { _all: true } }),
        prisma.league.groupBy({ by: ['status'],      _count: { _all: true } }),
        prisma.league.findMany({
            orderBy: { lastSyncedAt: 'desc' },
            take:    30,
            select:  { id: true, leagueName: true, platform: true, status: true, totalRosters: true, season: true, lastSyncedAt: true },
        }),
        // Stale: not synced in 48h
        prisma.league.count({
            where: {
                OR: [
                    { lastSyncedAt: { lt: startOf(2) } },
                    { lastSyncedAt: null },
                ],
            },
        }),
        getSyncFailureSummary(),
    ]);

    const platformMap  = Object.fromEntries(byPlatform.map(p => [p.platform, p._count._all]));
    const statusMap    = Object.fromEntries(byStatus.map(s => [s.status, s._count._all]));

    const platformColors: Record<string, string> = {
        sleeper: 'bg-emerald-500/40',
        espn:    'bg-orange-500/40',
        yahoo:   'bg-purple-500/40',
    };

    const statusColors: Record<string, string> = {
        in_season: 'text-emerald-400',
        pre_draft: 'text-gray-400',
        drafting:  'text-blue-400',
        complete:  'text-gray-600',
    };

    function platformBadge(p: string) {
        const colors: Record<string, string> = {
            sleeper: 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400',
            espn:    'bg-orange-900/30 border-orange-700/40 text-orange-400',
            yahoo:   'bg-purple-900/30 border-purple-700/40 text-purple-400',
        };
        return colors[p] ?? 'bg-gray-800 border-gray-700 text-gray-400';
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Leagues</h1>
                <p className="text-gray-500 text-sm mt-1">Sync activity and league health</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Leagues"   value={totalLeagues} />
                <StatCard label="Synced Today"    value={leaguesToday}  sub={`${leaguesWeek} this week`} />
                <StatCard label="Stale (48h+)"    value={staleLeagues}  sub="not synced recently" />
                <StatCard label="Sync Rate"        value={`${totalLeagues > 0 ? Math.round((leaguesWeek / totalLeagues) * 100) : 0}%`} sub="synced last 7 days" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* By platform */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Leagues by Platform</p>
                    <div className="space-y-3">
                        {(['sleeper', 'espn', 'yahoo'] as const).map(p => {
                            const count = platformMap[p] ?? 0;
                            const pct   = totalLeagues > 0 ? Math.round((count / totalLeagues) * 100) : 0;
                            return (
                                <div key={p}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm text-gray-300 capitalize">{p}</span>
                                        <span className="font-bold text-white tabular-nums">{count} <span className="text-gray-600 font-normal">({pct}%)</span></span>
                                    </div>
                                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                        <div className={`h-full ${platformColors[p]} rounded-full`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* By status */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Leagues by Status</p>
                    <div className="space-y-3">
                        {[
                            { key: 'in_season', label: 'In Season'  },
                            { key: 'pre_draft', label: 'Pre-Draft'  },
                            { key: 'drafting',  label: 'Drafting'   },
                            { key: 'complete',  label: 'Complete'   },
                        ].map(({ key, label }) => {
                            const count = statusMap[key] ?? 0;
                            return (
                                <div key={key} className="flex items-center justify-between">
                                    <span className={`text-sm ${statusColors[key]}`}>{label}</span>
                                    <span className="font-bold text-white tabular-nums">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Sync Failures */}
            {syncFailures.unresolvedCount > 0 && (
                <div className="bg-gray-900 border border-red-900/40 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-red-900/40 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-red-400">Sync Failures</p>
                            <p className="text-xs text-gray-600">{syncFailures.unresolvedCount} unresolved event{syncFailures.unresolvedCount !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-900/30 border border-red-700/40 text-red-400 tabular-nums">
                            {syncFailures.failingLeagues.length} league{syncFailures.failingLeagues.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="divide-y divide-gray-800">
                        {syncFailures.failingLeagues.map(l => (
                            <div key={l.id} className="px-5 py-3 flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-white truncate">{l.leagueName}</p>
                                    <p className="text-xs text-red-400/70 truncate mt-0.5">{l.syncLastError ?? '—'}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${platformBadge(l.platform)}`}>
                                        {l.platform.toUpperCase().slice(0, 3)}
                                    </span>
                                    <span className={`text-xs font-semibold ${l.syncStatus === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                                        {l.syncStatus}
                                    </span>
                                    <span className="text-[10px] text-gray-600 tabular-nums">
                                        {l.syncErrorCount}x
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {syncFailures.recentEvents.length > 0 && (
                        <div className="px-5 py-3 border-t border-gray-800">
                            <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Recent Events</p>
                            <div className="space-y-1.5">
                                {syncFailures.recentEvents.slice(0, 5).map(e => (
                                    <div key={e.id} className="flex items-center justify-between text-xs">
                                        <span className="text-gray-400 truncate max-w-[60%]">{e.errorMsg}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`font-medium ${
                                                e.errorType === 'auth'       ? 'text-red-400'    :
                                                e.errorType === 'rate_limit' ? 'text-yellow-400' :
                                                e.errorType === 'network'    ? 'text-blue-400'   :
                                                'text-gray-500'
                                            }`}>{e.errorType}</span>
                                            <span className="text-gray-600">{e.platform}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Recent syncs */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">Recently Synced Leagues</p>
                    <p className="text-xs text-gray-600">Last 30 sync events</p>
                </div>
                <div className="divide-y divide-gray-800">
                    {recentLeagues.map(l => (
                        <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-white truncate">{l.leagueName}</p>
                                <p className="text-xs text-gray-600">{l.totalRosters} teams · Season {l.season}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${platformBadge(l.platform)}`}>
                                    {l.platform.toUpperCase().slice(0, 3)}
                                </span>
                                <span className={`text-xs ${statusColors[l.status] ?? 'text-gray-500'}`}>
                                    {l.status.replace('_', ' ')}
                                </span>
                                <span className="text-[10px] text-gray-600 tabular-nums whitespace-nowrap">
                                    {l.lastSyncedAt ? new Date(l.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
