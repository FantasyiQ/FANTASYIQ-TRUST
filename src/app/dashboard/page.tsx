import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SubscriptionTier } from '@prisma/client';

function formatTier(tier: SubscriptionTier): string {
    switch (tier) {
        case 'FREE':             return 'Free';
        case 'PLAYER_PRO':       return 'Player Pro';
        case 'PLAYER_ALL_PRO':   return 'Player All-Pro';
        case 'PLAYER_ELITE':     return 'Player Elite';
        case 'COMMISSIONER_PRO':     return 'Commissioner Pro';
        case 'COMMISSIONER_ALL_PRO': return 'Commissioner All-Pro';
        case 'COMMISSIONER_ELITE':   return 'Commissioner Elite';
    }
}

function isFree(tier: SubscriptionTier): boolean {
    return tier === 'FREE';
}

export default async function DashboardPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            name: true,
            subscriptionTier: true,
            leagues: {
                orderBy: { lastSyncedAt: 'desc' },
                select: {
                    id: true,
                    leagueName: true,
                    platform: true,
                    seasonYear: true,
                    leagueSize: true,
                    scoringFormat: true,
                    lastSyncedAt: true,
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    const { name, subscriptionTier, leagues } = user;
    const displayName = name ?? session.user.email;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Welcome */}
                <div>
                    <p className="text-gray-400 text-sm mb-1">Dashboard</p>
                    <h1 className="text-3xl font-bold">Welcome back, {displayName}.</h1>
                </div>

                {/* Subscription card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-center justify-between gap-6">
                    <div>
                        <p className="text-gray-400 text-sm mb-1">Current Plan</p>
                        <p className="text-2xl font-bold text-[#C8A951]">{formatTier(subscriptionTier)}</p>
                        {isFree(subscriptionTier) && (
                            <p className="text-gray-500 text-sm mt-1">
                                Upgrade to sync leagues and unlock all tools.
                            </p>
                        )}
                    </div>
                    {isFree(subscriptionTier) ? (
                        <Link
                            href="/pricing"
                            className="shrink-0 bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm"
                        >
                            Upgrade
                        </Link>
                    ) : (
                        <Link
                            href="/pricing"
                            className="shrink-0 border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-5 py-2.5 rounded-lg transition text-sm"
                        >
                            Manage
                        </Link>
                    )}
                </div>

                {/* Leagues */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                        <h2 className="font-semibold text-lg">Synced Leagues</h2>
                        <span className="text-gray-500 text-sm">{leagues.length} league{leagues.length !== 1 ? 's' : ''}</span>
                    </div>

                    {leagues.length === 0 ? (
                        <div className="px-6 py-14 text-center">
                            <p className="text-gray-400 mb-1">No leagues synced yet.</p>
                            <p className="text-gray-600 text-sm">Connect a Sleeper, ESPN, or Yahoo league to get started.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-400 text-left border-b border-gray-800">
                                    <th className="px-6 py-3 font-medium">League</th>
                                    <th className="px-6 py-3 font-medium">Platform</th>
                                    <th className="px-6 py-3 font-medium">Season</th>
                                    <th className="px-6 py-3 font-medium">Size</th>
                                    <th className="px-6 py-3 font-medium">Last Synced</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leagues.map((league) => (
                                    <tr
                                        key={league.id}
                                        className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
                                    >
                                        <td className="px-6 py-4 font-medium text-white">{league.leagueName}</td>
                                        <td className="px-6 py-4 text-gray-300 capitalize">{league.platform}</td>
                                        <td className="px-6 py-4 text-gray-300">{league.seasonYear}</td>
                                        <td className="px-6 py-4 text-gray-300">{league.leagueSize ?? '—'}</td>
                                        <td className="px-6 py-4 text-gray-400">
                                            {league.lastSyncedAt
                                                ? new Date(league.lastSyncedAt).toLocaleDateString()
                                                : 'Never'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Quick actions */}
                <div>
                    <h2 className="font-semibold text-lg mb-4">Quick Actions</h2>
                    <div className="grid sm:grid-cols-3 gap-3">
                        <Link
                            href="/leagues/sync"
                            className="bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-xl p-5 transition group"
                        >
                            <div className="text-2xl mb-2">🔗</div>
                            <p className="font-semibold text-white group-hover:text-[#C8A951] transition">Sync a League</p>
                            <p className="text-gray-500 text-sm mt-0.5">Connect Sleeper, ESPN, or Yahoo</p>
                        </Link>
                        <Link
                            href="/trade-chart"
                            className="bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-xl p-5 transition group"
                        >
                            <div className="text-2xl mb-2">📊</div>
                            <p className="font-semibold text-white group-hover:text-[#C8A951] transition">View Trade Chart</p>
                            <p className="text-gray-500 text-sm mt-0.5">Dynamic player valuations</p>
                        </Link>
                        <Link
                            href="/pricing"
                            className="bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-xl p-5 transition group"
                        >
                            <div className="text-2xl mb-2">💳</div>
                            <p className="font-semibold text-white group-hover:text-[#C8A951] transition">Manage Subscription</p>
                            <p className="text-gray-500 text-sm mt-0.5">Plans, billing, and upgrades</p>
                        </Link>
                    </div>
                </div>

            </div>
        </main>
    );
}
