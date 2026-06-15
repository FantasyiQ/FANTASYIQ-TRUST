export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

function fmt(d: Date) {
    return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

export default async function WebhooksAdminPage() {
    const [totalEvents, recentEvents, last24h, last7d] = await Promise.all([
        prisma.processedStripeEvent.count(),
        prisma.processedStripeEvent.findMany({
            orderBy: { processedAt: 'desc' },
            take: 100,
        }),
        prisma.processedStripeEvent.count({
            where: { processedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
        prisma.processedStripeEvent.count({
            where: { processedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        }),
    ]);

    const lastEvent = recentEvents[0] ?? null;
    const minutesSinceLast = lastEvent
        ? Math.round((Date.now() - lastEvent.processedAt.getTime()) / 60000)
        : null;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Stripe Webhook Health</h1>
                <p className="text-gray-500 text-sm mt-1">Idempotency log — every processed Stripe event.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Events', value: totalEvents.toLocaleString() },
                    { label: 'Last 7 Days',  value: last7d.toLocaleString() },
                    { label: 'Last 24 Hours', value: last24h.toLocaleString() },
                    {
                        label: 'Last Event',
                        value: minutesSinceLast === null
                            ? '—'
                            : minutesSinceLast < 60
                                ? `${minutesSinceLast}m ago`
                                : `${Math.round(minutesSinceLast / 60)}h ago`,
                    },
                ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
                        <p className="text-2xl font-bold text-white mt-1">{value}</p>
                    </div>
                ))}
            </div>

            {/* Webhook endpoint reminder */}
            <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl px-5 py-4 text-sm text-blue-300 space-y-1">
                <p className="font-semibold text-blue-200">Stripe webhook endpoint</p>
                <p className="font-mono text-xs text-blue-400">
                    https://fantasyiqtrust.com/api/webhooks/stripe
                </p>
                <p className="text-blue-400/70 text-xs">
                    Configure in Stripe Dashboard → Developers → Webhooks. Events below confirm delivery is working.
                </p>
            </div>

            {/* Recent events table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                    <h2 className="text-sm font-semibold text-white">Recent Events (last 100)</h2>
                </div>

                {recentEvents.length === 0 ? (
                    <div className="px-6 py-10 text-center text-gray-500 text-sm">
                        No webhook events recorded yet.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800/60">
                        {recentEvents.map(ev => (
                            <div key={ev.id} className="px-6 py-3 flex items-center justify-between gap-4 hover:bg-gray-800/30 transition-colors">
                                <span className="font-mono text-xs text-[#D4AF37]/80 truncate">{ev.id}</span>
                                <span className="text-xs text-gray-500 shrink-0">{fmt(ev.processedAt)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
