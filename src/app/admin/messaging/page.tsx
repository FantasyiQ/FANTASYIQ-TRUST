export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

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

// Friendly label + colour for each notification type
const TYPE_META: Record<string, { label: string; color: string }> = {
    // Dues
    'dues.reminder.weekly':           { label: 'Dues Reminder (weekly)',    color: 'bg-blue-500/40' },
    'dues.reminder.three_per_week':   { label: 'Dues Reminder (3/wk)',      color: 'bg-blue-500/40' },
    'dues.reminder.daily':            { label: 'Dues Reminder (daily)',     color: 'bg-blue-500/40' },
    'dues.reminder.final_hours':      { label: 'Dues Reminder (final hrs)', color: 'bg-red-500/40'  },
    'dues.payment.confirmed':         { label: 'Payment Confirmed',         color: 'bg-emerald-500/40' },
    'dues.payment.manual_recorded':   { label: 'Payment Manual',            color: 'bg-emerald-500/40' },
    'dues.updated':                   { label: 'Dues Updated',              color: 'bg-gray-500/40' },
    // Plan
    'plan.renewal_upcoming':          { label: 'Renewal Reminder',          color: 'bg-[#D4AF37]/40' },
    'plan.limit_reached':             { label: 'Plan Limit',                color: 'bg-amber-500/40' },
    'plan.payment_failed':            { label: 'Payment Failed',            color: 'bg-red-500/40'   },
    // Phase 3
    'sync_failure':                   { label: 'Sync Failure',              color: 'bg-red-500/40'   },
    'commissioner_nudge':             { label: 'Comm. Activation',          color: 'bg-purple-500/40' },
    'churn_nudge':                    { label: 'Churn Nudge',               color: 'bg-amber-500/40' },
    'upsell_prompt':                  { label: 'Upsell Prompt',             color: 'bg-blue-500/40'  },
    'league_health':                  { label: 'League Health Alert',       color: 'bg-orange-500/40'},
    'feature_suggestion':             { label: 'Feature Suggestion',        color: 'bg-teal-500/40'  },
    'league.sync.reminder':           { label: 'Sync Reminder (PRS)',       color: 'bg-cyan-500/40'  },
    // Digests
    'commissioner.alert.unpaid_members_digest': { label: 'Unpaid Digest',  color: 'bg-gray-500/40'  },
    'league.digest.weekly':           { label: 'League Digest',             color: 'bg-gray-500/40'  },
};

export default async function AdminMessagingPage() {
    const [
        totalNotifs,
        notifs30d,
        emailSent30d,
        unread30d,
        byType30d,
        byType7d,
        recentNotifs,
        byDay7d,
    ] = await Promise.all([
        prisma.notification.count(),
        prisma.notification.count({ where: { createdAt: { gte: startOf(30) } } }),
        prisma.notification.count({ where: { emailSent: true,  createdAt: { gte: startOf(30) } } }),
        prisma.notification.count({ where: { read: false,      createdAt: { gte: startOf(30) } } }),

        // Volume by type — last 30 days
        prisma.notification.groupBy({
            by:      ['type'],
            where:   { createdAt: { gte: startOf(30) } },
            _count:  { _all: true },
            orderBy: { _count: { type: 'desc' } },
        }),

        // Volume by type — last 7 days (for WoW context)
        prisma.notification.groupBy({
            by:    ['type'],
            where: { createdAt: { gte: startOf(7) } },
            _count: { _all: true },
        }),

        // Recent notifications
        prisma.notification.findMany({
            orderBy: { createdAt: 'desc' },
            take:    30,
            select: {
                id: true, type: true, title: true, read: true,
                emailSent: true, createdAt: true,
                user: { select: { email: true } },
            },
        }),

        // Daily volume last 7 days — approximate via groupBy createdAt date
        // (Prisma doesn't have date-trunc; we'll group all and bucket client-side)
        prisma.notification.findMany({
            where:  { createdAt: { gte: startOf(7) } },
            select: { createdAt: true },
        }),
    ]);

    const emailRate = notifs30d > 0 ? Math.round((emailSent30d / notifs30d) * 100) : 0;
    const readRate  = notifs30d > 0 ? Math.round(((notifs30d - unread30d) / notifs30d) * 100) : 0;

    const sevenDayMap = new Map(byType7d.map(r => [r.type, r._count._all]));

    // Daily bucketing
    const dailyBuckets: Record<string, number> = {};
    for (const n of byDay7d) {
        const day = new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dailyBuckets[day] = (dailyBuckets[day] ?? 0) + 1;
    }
    const dailyEntries = Object.entries(dailyBuckets).slice(-7);
    const dailyMax     = Math.max(1, ...dailyEntries.map(([, c]) => c));

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Messaging</h1>
                <p className="text-gray-500 text-sm mt-1">Unified view across all automated notification channels</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total (all time)" value={totalNotifs.toLocaleString()} sub="notifications created" />
                <StatCard label="Sent (30d)"        value={notifs30d}     sub="in-app + email" />
                <StatCard label="Email Rate"         value={`${emailRate}%`} sub="of 30d notifs emailed" />
                <StatCard label="Read Rate"          value={`${readRate}%`}  sub="of 30d notifs read" />
            </div>

            {/* 7-day volume bar chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Daily Volume — Last 7 Days</p>
                <div className="flex items-end gap-2 h-20">
                    {dailyEntries.map(([day, count]) => (
                        <div key={day} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[9px] text-gray-600 tabular-nums">{count}</span>
                            <div
                                className="w-full bg-[#D4AF37]/50 rounded-t"
                                style={{ height: `${Math.max(4, Math.round((count / dailyMax) * 60))}px` }}
                            />
                            <span className="text-[9px] text-gray-600 whitespace-nowrap">{day}</span>
                        </div>
                    ))}
                    {dailyEntries.length === 0 && (
                        <p className="text-gray-600 text-sm w-full text-center">No notifications in the last 7 days.</p>
                    )}
                </div>
            </div>

            {/* Breakdown by type */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">Volume by Notification Type</p>
                    <p className="text-xs text-gray-600">Last 30 days</p>
                </div>
                <div className="divide-y divide-gray-800">
                    {byType30d.map(row => {
                        const meta      = TYPE_META[row.type];
                        const label     = meta?.label ?? row.type;
                        const color     = meta?.color ?? 'bg-gray-500/40';
                        const pct       = notifs30d > 0 ? Math.round((row._count._all / notifs30d) * 100) : 0;
                        const thisWeek  = sevenDayMap.get(row.type) ?? 0;
                        return (
                            <div key={row.type} className="px-5 py-3">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${color}`} />
                                        <span className="text-sm text-gray-300">{label}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-right">
                                        <span className="text-[10px] text-gray-600">{thisWeek} this wk</span>
                                        <span className="font-bold text-white tabular-nums">{row._count._all}</span>
                                        <span className="text-gray-600 text-xs">({pct}%)</span>
                                    </div>
                                </div>
                                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                    {byType30d.length === 0 && (
                        <div className="px-5 py-8 text-center text-gray-600 text-sm">No notifications in the last 30 days.</div>
                    )}
                </div>
            </div>

            {/* Recent notification log */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">Recent Notifications</p>
                    <p className="text-xs text-gray-600">Last 30 records</p>
                </div>
                <div className="divide-y divide-gray-800">
                    {recentNotifs.map(n => {
                        const meta = TYPE_META[n.type];
                        return (
                            <div key={n.id} className="px-5 py-2.5 flex items-center justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-white truncate">{n.title}</p>
                                    <p className="text-[10px] text-gray-600 truncate">{n.user.email}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[9px] font-semibold text-gray-500 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded">
                                        {meta?.label ?? n.type}
                                    </span>
                                    {n.emailSent && (
                                        <span className="text-[9px] font-semibold text-blue-400">✉</span>
                                    )}
                                    <span className={`text-[9px] font-semibold ${n.read ? 'text-gray-600' : 'text-[#D4AF37]'}`}>
                                        {n.read ? '✓' : '●'}
                                    </span>
                                    <span className="text-[10px] text-gray-600 tabular-nums whitespace-nowrap">
                                        {new Date(n.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
