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

export default async function AdminUsersPage() {
    const [
        totalUsers,
        newToday,
        newWeek,
        newMonth,
        usersWithLeagues,
        usersWithSleeper,
        usersWithEspn,
        usersWithYahoo,
        recentSignups,
        adminUsers,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: startOf(0) } } }),
        prisma.user.count({ where: { createdAt: { gte: startOf(7) } } }),
        prisma.user.count({ where: { createdAt: { gte: startOf(30) } } }),
        // Users who have at least one league synced
        prisma.user.count({ where: { leagues: { some: {} } } }),
        prisma.user.count({ where: { sleeperUserId: { not: null } } }),
        prisma.user.count({ where: { espnS2: { not: null } } }),
        prisma.user.count({ where: { yahooUserId: { not: null } } }),
        // Recent signups
        prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            take:    30,
            select:  { id: true, email: true, name: true, createdAt: true, sleeperUserId: true, espnS2: true, yahooUserId: true },
        }),
        prisma.user.findMany({
            where:   { isAdmin: true },
            select:  { email: true, name: true },
        }),
    ]);

    const activationRate = totalUsers > 0
        ? Math.round((usersWithLeagues / totalUsers) * 100)
        : 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Users</h1>
                <p className="text-gray-500 text-sm mt-1">Registration and activation analytics</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Users"  value={totalUsers.toLocaleString()} />
                <StatCard label="New Today"    value={newToday} sub={`${newWeek} this week`} />
                <StatCard label="Last 30 Days" value={newMonth} />
                <StatCard label="Activation"   value={`${activationRate}%`} sub={`${usersWithLeagues} synced a league`} />
            </div>

            {/* Platform connections */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Platform Connections</p>
                <div className="grid grid-cols-3 gap-6">
                    {[
                        { label: 'Sleeper', count: usersWithSleeper, color: 'bg-emerald-500/50' },
                        { label: 'ESPN',    count: usersWithEspn,    color: 'bg-orange-500/50'  },
                        { label: 'Yahoo',   count: usersWithYahoo,   color: 'bg-purple-500/50'  },
                    ].map(({ label, count, color }) => {
                        const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
                        return (
                            <div key={label} className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400">{label}</span>
                                    <span className="font-bold text-white">{count}</span>
                                </div>
                                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                                </div>
                                <p className="text-[10px] text-gray-600">{pct}% of users</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Admin accounts */}
            {adminUsers.length > 0 && (
                <div className="bg-gray-900 border border-[#D4AF37]/20 rounded-xl p-5">
                    <p className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider mb-3">Admin Accounts</p>
                    <div className="space-y-2">
                        {adminUsers.map(u => (
                            <div key={u.email} className="flex items-center gap-3 text-sm">
                                <span className="w-2 h-2 rounded-full bg-[#D4AF37] shrink-0" />
                                <span className="text-white">{u.name ?? '—'}</span>
                                <span className="text-gray-500">{u.email}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent signups */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">Recent Registrations</p>
                    <p className="text-xs text-gray-600">Last 30 sign-ups</p>
                </div>
                <div className="divide-y divide-gray-800">
                    {recentSignups.map(u => (
                        <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-white truncate">{u.email}</p>
                                {u.name && <p className="text-xs text-gray-600">{u.name}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {u.sleeperUserId && <span className="text-[9px] font-bold bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 px-1.5 py-0.5 rounded">SLP</span>}
                                {u.espnS2        && <span className="text-[9px] font-bold bg-orange-900/30 border border-orange-700/40 text-orange-400 px-1.5 py-0.5 rounded">ESPN</span>}
                                {u.yahooUserId   && <span className="text-[9px] font-bold bg-purple-900/30 border border-purple-700/40 text-purple-400 px-1.5 py-0.5 rounded">YHO</span>}
                                <span className="text-[10px] text-gray-600 tabular-nums whitespace-nowrap">
                                    {new Date(u.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
