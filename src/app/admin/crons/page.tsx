export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

function startOf(daysAgo: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
}

function StatusBadge({ status }: { status: string }) {
    const styles =
        status === 'success' ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' :
        status === 'partial' ? 'bg-amber-900/30 border-amber-700/40 text-amber-400'       :
                               'bg-red-900/30 border-red-700/40 text-red-400';
    return (
        <span className={`text-[10px] font-bold uppercase tracking-wider border rounded px-2 py-0.5 ${styles}`}>
            {status}
        </span>
    );
}

function timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default async function AdminCronsPage() {
    const [recentLogs, byName] = await Promise.all([
        prisma.cronLog.findMany({
            orderBy: { createdAt: 'desc' },
            take:    200,
        }),
        prisma.cronLog.groupBy({
            by:      ['cron'],
            where:   { createdAt: { gte: startOf(7) } },
            _count:  { _all: true },
            _avg:    { durationMs: true },
            orderBy: { cron: 'asc' },
        }),
    ]);

    // For each cron name: last run, last status, success rate (7d)
    const cronNames = Array.from(new Set(recentLogs.map(l => l.cron))).sort();

    const summaries = cronNames.map(name => {
        const logs7d   = recentLogs.filter(l => l.cron === name && l.createdAt >= startOf(7));
        const allLogs  = recentLogs.filter(l => l.cron === name);
        const last     = allLogs[0];
        const success7 = logs7d.filter(l => l.status === 'success').length;
        const partial7 = logs7d.filter(l => l.status === 'partial').length;
        const error7   = logs7d.filter(l => l.status === 'error').length;
        const total7   = logs7d.length;
        const successRate = total7 > 0 ? Math.round((success7 / total7) * 100) : null;
        const avgDuration = total7 > 0
            ? Math.round(logs7d.reduce((s, l) => s + l.durationMs, 0) / total7)
            : null;
        return { name, last, success7, partial7, error7, total7, successRate, avgDuration };
    });

    const totalRuns7d   = recentLogs.filter(l => l.createdAt >= startOf(7)).length;
    const errorCount7d  = recentLogs.filter(l => l.createdAt >= startOf(7) && l.status === 'error').length;
    const uniqueCrons   = cronNames.length;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Cron Execution Log</h1>
                <p className="text-gray-500 text-sm mt-1">All cron runs · status · duration · item counts</p>
            </div>

            {/* Top stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Instrumented Crons', value: uniqueCrons, sub: 'logging to DB' },
                    { label: 'Runs (7d)',           value: totalRuns7d,  sub: 'all crons combined' },
                    { label: 'Errors (7d)',         value: errorCount7d, sub: errorCount7d > 0 ? '⚠ investigate' : 'clean' },
                    { label: 'Success Rate',        value: totalRuns7d > 0 ? `${Math.round(((totalRuns7d - errorCount7d) / totalRuns7d) * 100)}%` : '—', sub: '7-day window' },
                ].map(card => (
                    <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{card.label}</p>
                        <p className={`text-3xl font-black tabular-nums ${card.label === 'Errors (7d)' && errorCount7d > 0 ? 'text-red-400' : 'text-white'}`}>{card.value}</p>
                        {card.sub && <p className="text-xs text-gray-600">{card.sub}</p>}
                    </div>
                ))}
            </div>

            {recentLogs.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                    <p className="text-gray-400 font-semibold">No cron logs yet</p>
                    <p className="text-gray-600 text-sm mt-1">Logs appear after the first cron run following deployment.</p>
                </div>
            ) : (
                <>
                    {/* Per-cron summary */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800">
                            <p className="text-sm font-semibold text-white">Cron Health (7 days)</p>
                            <p className="text-xs text-gray-600">Success rate, avg duration, last run per cron</p>
                        </div>
                        <div className="divide-y divide-gray-800">
                            {summaries.map(s => (
                                <div key={s.name} className="px-5 py-3 flex items-center gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-mono text-white">{s.name}</p>
                                        <p className="text-[11px] text-gray-600 mt-0.5">
                                            {s.last ? `Last: ${timeAgo(s.last.createdAt)}` : 'No runs yet'}
                                            {s.last?.message ? ` · ${s.last.message}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500 tabular-nums">
                                        {s.successRate !== null && (
                                            <span className={s.successRate === 100 ? 'text-emerald-400' : s.successRate >= 80 ? 'text-amber-400' : 'text-red-400'}>
                                                {s.successRate}% ok
                                            </span>
                                        )}
                                        {s.avgDuration !== null && (
                                            <span>{s.avgDuration < 1000 ? `${s.avgDuration}ms` : `${(s.avgDuration / 1000).toFixed(1)}s`} avg</span>
                                        )}
                                        <span>{s.total7} runs</span>
                                        {s.error7 > 0 && <span className="text-red-400">{s.error7} err</span>}
                                        {s.last && <StatusBadge status={s.last.status} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent run log */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800">
                            <p className="text-sm font-semibold text-white">Recent Runs</p>
                            <p className="text-xs text-gray-600">Last 200 executions across all crons</p>
                        </div>
                        <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
                            {recentLogs.map(log => (
                                <div key={log.id} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                                    <StatusBadge status={log.status} />
                                    <span className="font-mono text-white w-48 shrink-0">{log.cron}</span>
                                    <span className="text-gray-500 w-20 shrink-0 tabular-nums">
                                        {log.durationMs < 1000 ? `${log.durationMs}ms` : `${(log.durationMs / 1000).toFixed(1)}s`}
                                    </span>
                                    <span className="text-gray-600 flex-1 truncate">{log.message ?? '—'}</span>
                                    <span className="text-gray-700 shrink-0">{timeAgo(log.createdAt)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
