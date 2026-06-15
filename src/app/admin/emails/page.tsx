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
        status === 'delivered' ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' :
        status === 'opened'    ? 'bg-blue-900/30 border-blue-700/40 text-blue-400'           :
        status === 'clicked'   ? 'bg-purple-900/30 border-purple-700/40 text-purple-400'     :
        status === 'bounced'   ? 'bg-red-900/30 border-red-700/40 text-red-400'               :
        status === 'complained'? 'bg-orange-900/30 border-orange-700/40 text-orange-400'      :
                                 'bg-gray-800 border-gray-700 text-gray-400';
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

export default async function AdminEmailsPage() {
    const [totalSent, byStatus, byType, recent] = await Promise.all([
        prisma.emailLog.count(),
        prisma.emailLog.groupBy({
            by:      ['status'],
            _count:  { _all: true },
            orderBy: { _count: { status: 'desc' } },
        }),
        prisma.emailLog.groupBy({
            by:      ['type'],
            where:   { sentAt: { gte: startOf(30) } },
            _count:  { _all: true },
            orderBy: { _count: { type: 'desc' } },
        }),
        prisma.emailLog.findMany({
            orderBy: { sentAt: 'desc' },
            take:    100,
            select:  { id: true, to: true, subject: true, type: true, status: true, resendId: true, sentAt: true },
        }),
    ]);

    const sentCount      = byStatus.find(s => s.status === 'sent')?._count._all      ?? 0;
    const deliveredCount = byStatus.find(s => s.status === 'delivered')?._count._all ?? 0;
    const bouncedCount   = byStatus.find(s => s.status === 'bounced')?._count._all   ?? 0;
    const openedCount    = byStatus.find(s => s.status === 'opened')?._count._all    ?? 0;
    const deliveryRate   = totalSent > 0 ? Math.round((deliveredCount / totalSent) * 100) : null;
    const openRate       = (deliveredCount + openedCount) > 0
        ? Math.round((openedCount / (deliveredCount + openedCount)) * 100) : null;

    const hasWebhookData = deliveredCount > 0 || bouncedCount > 0 || openedCount > 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Email Delivery</h1>
                <p className="text-gray-500 text-sm mt-1">All outbound emails · delivery status · open tracking via Resend webhook</p>
            </div>

            {/* Webhook setup notice */}
            {!hasWebhookData && totalSent > 0 && (
                <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl px-5 py-4 text-sm text-amber-300">
                    <span className="font-bold">Resend webhook not yet configured.</span>{' '}
                    Emails are being sent and logged, but delivery status won&apos;t update until you add the webhook in Resend Dashboard →{' '}
                    <span className="font-mono text-amber-200">https://www.fantasyiqtrust.com/api/webhooks/resend</span>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Sent',     value: totalSent,                              sub: 'all time' },
                    { label: 'Delivered',       value: deliveredCount,                         sub: deliveryRate !== null ? `${deliveryRate}% delivery rate` : 'webhook pending' },
                    { label: 'Bounced',         value: bouncedCount,                           sub: bouncedCount > 0 ? '⚠ check addresses' : 'clean' },
                    { label: 'Open Rate',       value: openRate !== null ? `${openRate}%` : '—', sub: `${openedCount} opens tracked` },
                ].map(card => (
                    <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
                        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{card.label}</p>
                        <p className={`text-3xl font-black tabular-nums ${card.label === 'Bounced' && bouncedCount > 0 ? 'text-red-400' : 'text-white'}`}>{card.value}</p>
                        {card.sub && <p className="text-xs text-gray-600">{card.sub}</p>}
                    </div>
                ))}
            </div>

            {totalSent === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                    <p className="text-gray-400 font-semibold">No emails logged yet</p>
                    <p className="text-gray-600 text-sm mt-1">Email logs appear after the first outbound email following deployment.</p>
                </div>
            ) : (
                <>
                    {/* By type breakdown */}
                    {byType.length > 0 && (
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Volume by Email Type (30d)</p>
                            <div className="space-y-3">
                                {byType.map(t => {
                                    const total = byType.reduce((s, x) => s + x._count._all, 0) || 1;
                                    return (
                                        <div key={t.type}>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-gray-300 font-mono">{t.type}</span>
                                                <span className="text-gray-500 tabular-nums">{t._count._all}</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#D4AF37]/60 rounded-full" style={{ width: `${(t._count._all / total) * 100}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Status breakdown */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Status Breakdown (all time)</p>
                        <div className="flex flex-wrap gap-3">
                            {byStatus.map(s => (
                                <div key={s.status} className="flex items-center gap-2">
                                    <StatusBadge status={s.status} />
                                    <span className="text-white font-bold tabular-nums text-sm">{s._count._all}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent emails */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800">
                            <p className="text-sm font-semibold text-white">Recent Emails</p>
                            <p className="text-xs text-gray-600">Last 100 outbound messages</p>
                        </div>
                        <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
                            {recent.map(e => (
                                <div key={e.id} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                                    <StatusBadge status={e.status} />
                                    <span className="text-gray-400 w-40 shrink-0 truncate">{e.to}</span>
                                    <span className="text-white flex-1 truncate">{e.subject}</span>
                                    <span className="text-gray-600 font-mono shrink-0">{e.type}</span>
                                    <span className="text-gray-700 shrink-0">{timeAgo(e.sentAt)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
