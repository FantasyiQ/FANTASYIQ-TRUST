export const dynamic = 'force-dynamic';

import { getLeagueHealthSummary } from '@/lib/league-health';
import type { HealthTier, HealthSignals } from '@/lib/league-health';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-black text-white tabular-nums">{value}</p>
            {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
    );
}

const TIER_STYLES: Record<HealthTier, { bar: string; badge: string; text: string }> = {
    healthy:   { bar: 'bg-emerald-500',   badge: 'bg-emerald-900/20 border-emerald-700/40 text-emerald-400',   text: 'text-emerald-400'   },
    fair:      { bar: 'bg-amber-400',     badge: 'bg-amber-900/20 border-amber-700/40 text-amber-400',         text: 'text-amber-400'     },
    unhealthy: { bar: 'bg-red-500',       badge: 'bg-red-900/20 border-red-700/40 text-red-400',               text: 'text-red-400'       },
    unknown:   { bar: 'bg-gray-600',      badge: 'bg-gray-800 border-gray-700 text-gray-500',                  text: 'text-gray-500'      },
};

const PLATFORM_BADGE: Record<string, string> = {
    sleeper: 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400',
    espn:    'bg-orange-900/30 border-orange-700/40 text-orange-400',
    yahoo:   'bg-purple-900/30 border-purple-700/40 text-purple-400',
};

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                <span>{label}</span>
                <span className="tabular-nums">{value}/{max}</span>
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default async function AdminHealthPage() {
    const { tierMap, byPlatform, worstLeagues, recentNudges } = await getLeagueHealthSummary();

    const total     = Object.values(tierMap).reduce((s, n) => s + n, 0);
    const healthy   = tierMap['healthy']   ?? 0;
    const fair      = tierMap['fair']      ?? 0;
    const unhealthy = tierMap['unhealthy'] ?? 0;
    const unknown   = tierMap['unknown']   ?? 0;

    const healthRate = total > 0 ? Math.round((healthy / total) * 100) : 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">League Health</h1>
                <p className="text-gray-500 text-sm mt-1">Platform-wide league health scores and commissioner alerts</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Healthy"           value={healthy}     sub={`${healthRate}% of all leagues`} />
                <StatCard label="Fair"              value={fair}        sub="needs attention" />
                <StatCard label="Unhealthy"         value={unhealthy}   sub="commissioner alerted" />
                <StatCard label="Nudges (7d)"       value={recentNudges}sub="league_health notifications" />
            </div>

            {/* Health distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Health Distribution</p>
                    <div className="space-y-3">
                        {(['healthy', 'fair', 'unhealthy', 'unknown'] as HealthTier[]).map(tier => {
                            const count = tierMap[tier] ?? 0;
                            const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                            const s     = TIER_STYLES[tier];
                            return (
                                <div key={tier}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-sm font-medium capitalize ${s.text}`}>{tier}</span>
                                        <span className="font-bold text-white tabular-nums">
                                            {count} <span className="text-gray-600 font-normal">({pct}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                        <div className={`h-full ${s.bar} opacity-70 rounded-full`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* By platform */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Health by Platform</p>
                    <div className="space-y-2">
                        {(['sleeper', 'espn', 'yahoo'] as const).map(platform => {
                            const rows       = byPlatform.filter(r => r.platform === platform);
                            const platTotal  = rows.reduce((s, r) => s + r._count._all, 0);
                            const platHealth = rows.find(r => r.healthTier === 'healthy')?._count._all ?? 0;
                            const rate       = platTotal > 0 ? Math.round((platHealth / platTotal) * 100) : 0;
                            return (
                                <div key={platform} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${PLATFORM_BADGE[platform]}`}>
                                            {platform.toUpperCase().slice(0, 3)}
                                        </span>
                                        <span className="text-sm text-gray-300 capitalize">{platform}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-right">
                                        <span className="text-xs text-gray-600">{platTotal} leagues</span>
                                        <span className={`text-sm font-bold ${rate >= 70 ? 'text-emerald-400' : rate >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                                            {rate}% healthy
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Worst leagues */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">Unhealthy Leagues</p>
                    <p className="text-xs text-gray-600">Lowest health scores — commissioners have been alerted</p>
                </div>
                {worstLeagues.length === 0 ? (
                    <div className="px-5 py-10 text-center text-gray-600 text-sm">
                        No unhealthy leagues. Run the health cron to populate scores.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {worstLeagues.map(l => {
                            const sigs = l.healthSignals as HealthSignals | null;
                            return (
                                <div key={l.id} className="px-5 py-4">
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-white truncate">{l.leagueName}</p>
                                            <p className="text-xs text-gray-600 truncate">{l.user.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${PLATFORM_BADGE[l.platform] ?? 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                                {l.platform.toUpperCase().slice(0, 3)}
                                            </span>
                                            <span className="text-lg font-black tabular-nums text-red-400">{l.healthScore}</span>
                                        </div>
                                    </div>
                                    {sigs && (
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                            <ScoreBar label="Sync"         value={sigs.syncScore}  max={35} color="bg-blue-400"    />
                                            <ScoreBar label="Data"         value={sigs.dataScore}  max={25} color="bg-purple-400"  />
                                            <ScoreBar label="Draft"        value={sigs.draftScore} max={20} color="bg-amber-400"   />
                                            <ScoreBar label="Commissioner" value={sigs.commScore}  max={20} color="bg-emerald-400" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
