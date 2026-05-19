export const dynamic = 'force-dynamic';

import { getChurnSummary } from '@/lib/churn-prevention';
import type { RiskTier } from '@/lib/churn-prevention';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-black text-white tabular-nums">{value}</p>
            {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
    );
}

const TIER_STYLES: Record<RiskTier, { bg: string; border: string; text: string; dot: string }> = {
    high:   { bg: 'bg-red-900/20',    border: 'border-red-700/40',    text: 'text-red-400',    dot: 'bg-red-400'    },
    medium: { bg: 'bg-amber-900/20',  border: 'border-amber-700/40',  text: 'text-amber-400',  dot: 'bg-amber-400'  },
    low:    { bg: 'bg-gray-800/40',   border: 'border-gray-700/40',   text: 'text-gray-400',   dot: 'bg-gray-500'   },
};

const SIGNAL_LABELS: Record<string, string> = {
    no_sync_14d:          'No sync 14d+',
    no_sync_10d:          'No sync 10d+',
    no_features_10d:      'No features 10d+',
    no_features_7d:       'No features 7d+',
    cancel_at_period_end: 'Cancelling',
    sync_failures:        'Sync failures',
    stale_dues:           'Stale dues',
};

export default async function AdminChurnPage() {
    const { tierMap, recentEvents, resolvedThisWeek } = await getChurnSummary();

    const totalAtRisk = tierMap.high + tierMap.medium + tierMap.low;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Churn Prevention</h1>
                <p className="text-gray-500 text-sm mt-1">At-risk users by signal and tier</p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total At-Risk"   value={totalAtRisk}        sub="unresolved events" />
                <StatCard label="High Risk"        value={tierMap.high}       sub="score 61-100" />
                <StatCard label="Medium Risk"      value={tierMap.medium}     sub="score 31-60" />
                <StatCard label="Resolved (7d)"   value={resolvedThisWeek}   sub="became healthy" />
            </div>

            {/* Risk tier bars */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">At-Risk Breakdown</p>
                <div className="space-y-4">
                    {(['high', 'medium', 'low'] as RiskTier[]).map(tier => {
                        const count = tierMap[tier];
                        const pct   = totalAtRisk > 0 ? Math.round((count / totalAtRisk) * 100) : 0;
                        const s     = TIER_STYLES[tier];
                        return (
                            <div key={tier}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                                        <span className={`text-sm font-medium capitalize ${s.text}`}>{tier} Risk</span>
                                    </div>
                                    <span className="font-bold text-white tabular-nums">
                                        {count} <span className="text-gray-600 font-normal">({pct}%)</span>
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${s.dot} opacity-70`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* At-risk user list */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">At-Risk Users</p>
                    <p className="text-xs text-gray-600">Most recent {recentEvents.length} open events</p>
                </div>
                {recentEvents.length === 0 ? (
                    <div className="px-5 py-10 text-center text-gray-600 text-sm">
                        No at-risk users detected.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {recentEvents.map(e => {
                            const tier = e.riskTier as RiskTier;
                            const s    = TIER_STYLES[tier];
                            const sigs = Array.isArray(e.signals) ? e.signals as string[] : [];
                            return (
                                <div key={e.id} className="px-5 py-3 flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-white truncate">{e.user.email}</p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {sigs.map(sig => (
                                                <span
                                                    key={sig}
                                                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-gray-800/60 border-gray-700 text-gray-400"
                                                >
                                                    {SIGNAL_LABELS[sig] ?? sig}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border capitalize ${s.bg} ${s.border} ${s.text}`}>
                                            {tier}
                                        </span>
                                        <span className="text-sm font-black tabular-nums text-white">{e.riskScore}</span>
                                        <span className="text-[10px] text-gray-600 whitespace-nowrap">
                                            {new Date(e.createdAt).toLocaleDateString()}
                                        </span>
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
