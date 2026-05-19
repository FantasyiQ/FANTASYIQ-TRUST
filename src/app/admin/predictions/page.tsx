export const dynamic = 'force-dynamic';

import { getPredictionsSummary } from '@/lib/predictive-models';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-black text-white tabular-nums">{value}</p>
            {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
    );
}

function ProbBadge({ value }: { value: number }) {
    const pct = Math.round(value * 100);
    const color = pct >= 70 ? 'text-red-400' : pct >= 40 ? 'text-amber-400' : 'text-emerald-400';
    return <span className={`text-sm font-black tabular-nums ${color}`}>{pct}%</span>;
}

function BucketBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">{label}</span>
                <span className="text-xs font-bold text-white tabular-nums">{count} <span className="text-gray-600 font-normal">({pct}%)</span></span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default async function AdminPredictionsPage() {
    const {
        highChurnUsers,
        highConversionUsers,
        churnBuckets,
        convBuckets,
        survivalBuckets,
        totalPredictions,
    } = await getPredictionsSummary();

    const [cb0, cb1, cb2, cb3, cb4] = churnBuckets;
    const [cv0, cv1, cv2, cv3]      = convBuckets;
    const [sv0, sv1, sv2]           = survivalBuckets;

    const highChurnCount  = cb3 + cb4;
    const highConvCount   = cv2 + cv3;
    const survivalAtRisk  = sv0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Predictive Models</h1>
                <p className="text-gray-500 text-sm mt-1">
                    Logistic regression over behavioral signals — model v1
                </p>
            </div>

            {totalPredictions === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                    <p className="text-2xl mb-3">🧠</p>
                    <p className="font-semibold text-white">No predictions yet</p>
                    <p className="text-gray-500 text-sm mt-1">
                        The predictive models cron runs daily at 3:00 PM UTC. Trigger it manually via the cron endpoint to populate scores.
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard label="Users Scored"       value={totalPredictions.toLocaleString()} sub="with active predictions" />
                        <StatCard label="High Churn Risk"    value={highChurnCount}    sub="probability ≥ 50%" />
                        <StatCard label="Conv. Opportunities"value={highConvCount}     sub="conversion prob. ≥ 30%" />
                        <StatCard label="At-Risk Leagues"    value={survivalAtRisk}    sub="survival prob. < 30%" />
                    </div>

                    {/* Distribution charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Churn distribution */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Churn Probability Distribution</p>
                            <div className="space-y-2.5">
                                <BucketBar label="< 10%"      count={cb0} total={totalPredictions} color="bg-emerald-500" />
                                <BucketBar label="10–25%"     count={cb1} total={totalPredictions} color="bg-emerald-400/60" />
                                <BucketBar label="25–50%"     count={cb2} total={totalPredictions} color="bg-amber-400" />
                                <BucketBar label="50–75%"     count={cb3} total={totalPredictions} color="bg-red-400/80" />
                                <BucketBar label="≥ 75%"      count={cb4} total={totalPredictions} color="bg-red-500" />
                            </div>
                        </div>

                        {/* Conversion distribution */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Commissioner Conversion Distribution</p>
                            <div className="space-y-2.5">
                                <BucketBar label="< 10%"      count={cv0} total={totalPredictions} color="bg-gray-600" />
                                <BucketBar label="10–30%"     count={cv1} total={totalPredictions} color="bg-blue-400/60" />
                                <BucketBar label="30–50%"     count={cv2} total={totalPredictions} color="bg-blue-400" />
                                <BucketBar label="≥ 50%"      count={cv3} total={totalPredictions} color="bg-purple-400" />
                            </div>
                        </div>

                        {/* League survival distribution */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">League Survival Distribution</p>
                            <div className="space-y-2.5">
                                <BucketBar label="< 30% (at risk)"  count={sv0} total={sv0 + sv1 + sv2} color="bg-red-500" />
                                <BucketBar label="30–60% (uncertain)"count={sv1} total={sv0 + sv1 + sv2} color="bg-amber-400" />
                                <BucketBar label="≥ 60% (likely)"   count={sv2} total={sv0 + sv1 + sv2} color="bg-emerald-500" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* High churn users */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-800">
                                <p className="text-sm font-semibold text-white">Highest Churn Risk</p>
                                <p className="text-xs text-gray-600">Top 20 users by churn probability</p>
                            </div>
                            <div className="divide-y divide-gray-800">
                                {highChurnUsers.map(u => (
                                    <div key={u.userId} className="px-5 py-2.5 flex items-center justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-white truncate">{u.user.email}</p>
                                            <p className="text-[10px] text-gray-600 font-mono">{u.user.subscriptionTier}</p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 text-right">
                                            <div>
                                                <p className="text-[9px] text-gray-600 uppercase tracking-wide">churn</p>
                                                <ProbBadge value={u.churnProbability} />
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-gray-600 uppercase tracking-wide">conv</p>
                                                <ProbBadge value={u.conversionProbability} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* High conversion users */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-800">
                                <p className="text-sm font-semibold text-white">Top Conversion Opportunities</p>
                                <p className="text-xs text-gray-600">Top 20 users by commissioner conversion probability</p>
                            </div>
                            <div className="divide-y divide-gray-800">
                                {highConversionUsers.map(u => (
                                    <div key={u.userId} className="px-5 py-2.5 flex items-center justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-white truncate">{u.user.email}</p>
                                            <p className="text-[10px] text-gray-600 font-mono">{u.user.subscriptionTier}</p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 text-right">
                                            <div>
                                                <p className="text-[9px] text-gray-600 uppercase tracking-wide">conv</p>
                                                <ProbBadge value={u.conversionProbability} />
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-gray-600 uppercase tracking-wide">upgrade</p>
                                                <ProbBadge value={u.upgradeProbability} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
