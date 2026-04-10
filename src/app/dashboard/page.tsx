import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unsyncLeague } from '@/app/actions/leagues';
import { createPortalSession } from '@/app/actions/stripe';
import ConnectedLeagues from '@/components/ConnectedLeagues';
import { getLeagueLimit, tierToLimitKey, nextTierName } from '@/lib/league-limits';
import type { SubscriptionTier } from '@prisma/client';

function formatTier(tier: SubscriptionTier | string): string {
    switch (tier) {
        case 'FREE':                 return 'Free';
        case 'PLAYER_PRO':           return 'Player Pro';
        case 'PLAYER_ALL_PRO':       return 'Player All-Pro';
        case 'PLAYER_ELITE':         return 'Player Elite';
        case 'COMMISSIONER_PRO':     return 'Commissioner Pro';
        case 'COMMISSIONER_ALL_PRO': return 'Commissioner All-Pro';
        case 'COMMISSIONER_ELITE':   return 'Commissioner Elite';
        default:                     return tier;
    }
}

function commLabel(tier: string, leagueSize: number | null): string {
    return `${formatTier(tier)} — ${leagueSize ? `${leagueSize}-Team` : ''} League`;
}

const STATUS_STYLES: Record<string, string> = {
    active:    'bg-green-900/40 text-green-400 border-green-800',
    trialing:  'bg-blue-900/40 text-blue-400 border-blue-800',
    past_due:  'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    canceled:  'bg-red-900/40 text-red-400 border-red-800',
    inactive:  'bg-gray-800 text-gray-500 border-gray-700',
};

const COMM_TIER_BADGE: Record<string, { label: string; className: string }> = {
    COMMISSIONER_PRO:     { label: 'Pro',     className: 'bg-gray-800 text-gray-300 border-gray-600' },
    COMMISSIONER_ALL_PRO: { label: 'All-Pro', className: 'bg-[#C8A951] text-black border-[#C8A951]' },
    COMMISSIONER_ELITE:   { label: 'Elite ✦', className: 'bg-[#C8A951]/25 text-[#C8A951] border-[#C8A951]/60' },
};

const LEAGUE_STATUS_STYLES: Record<string, string> = {
    in_season: 'bg-green-900/40 text-green-400 border-green-800',
    drafting:  'bg-blue-900/40 text-blue-400 border-blue-800',
    pre_draft: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    complete:  'bg-gray-800 text-gray-500 border-gray-700',
};

function leagueStatusLabel(status: string) {
    switch (status) {
        case 'in_season':  return 'In Season';
        case 'drafting':   return 'Drafting';
        case 'pre_draft':  return 'Pre-Draft';
        case 'complete':   return 'Complete';
        default:           return status;
    }
}

function periodLabel(sub: { cancelAtPeriodEnd: boolean; currentPeriodEnd: Date | null } | undefined) {
    if (!sub?.cancelAtPeriodEnd || !sub?.currentPeriodEnd) return null;
    const date = new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
    return `Cancels ${date}`;
}

export default async function DashboardPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            name: true,
            image: true,
            subscriptionTier: true,
            subscriptions: {
                select: {
                    id: true,
                    type: true,
                    tier: true,
                    leagueSize: true,
                    leagueName: true,
                    discountPct: true,
                    status: true,
                    stripeSubscriptionId: true,
                    currentPeriodEnd: true,
                    cancelAtPeriodEnd: true,
                },
            },
            connectedLeagues: {
                orderBy: { createdAt: 'asc' },
                select: { id: true, leagueName: true, platform: true },
            },
            leagues: {
                orderBy: { lastSyncedAt: 'desc' },
                select: {
                    id: true,
                    leagueId: true,
                    leagueName: true,
                    platform: true,
                    season: true,
                    status: true,
                    totalRosters: true,
                    scoringType: true,
                    avatar: true,
                    lastSyncedAt: true,
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    const { name, image, subscriptionTier, subscriptions, connectedLeagues, leagues } = user;
    const displayName = (name ?? session.user.email ?? '').split(' ')[0];

    const activeSubs = subscriptions.filter(
        s => s.status === 'active' || s.status === 'trialing'
    );
    const playerSub  = activeSubs.find(s => s.type === 'player') ?? null;
    const commSubs   = activeSubs
        .filter(s => s.type === 'commissioner')
        .sort((a, b) => (a.leagueName ?? '').localeCompare(b.leagueName ?? ''));

    const hasAnyActiveSub = activeSubs.length > 0;
    const isElite = subscriptionTier === 'PLAYER_ELITE' || subscriptionTier === 'COMMISSIONER_ELITE';

    const leagueLimitKey = tierToLimitKey(subscriptionTier);
    const leagueLimit    = getLeagueLimit(leagueLimitKey);
    const nextTier       = nextTierName(subscriptionTier);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Welcome header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        {image ? (
                            <Image src={image} alt={displayName ?? ''} width={52} height={52}
                                className="rounded-full ring-2 ring-gray-700" />
                        ) : (
                            <div className="w-[52px] h-[52px] rounded-full bg-gray-800 ring-2 ring-gray-700 flex items-center justify-center text-xl font-bold text-gray-400">
                                {(displayName ?? '?')[0].toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="text-gray-400 text-sm">Dashboard</p>
                            <h1 className="text-2xl font-bold">Welcome back, {displayName}.</h1>
                        </div>
                    </div>

                    <form action={async () => {
                        'use server';
                        await signOut({ redirectTo: '/' });
                    }}>
                        <button type="submit"
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-4 py-2 rounded-lg transition text-sm">
                            Sign Out
                        </button>
                    </form>
                </div>

                {/* ── Player Plan ───────────────────────────────────────── */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">Player Plan</p>

                    {playerSub ? (
                        <>
                            <div className="flex items-start justify-between gap-6 flex-wrap">
                                <div>
                                    <p className="text-2xl font-bold text-[#C8A951]">{formatTier(playerSub.tier)}</p>
                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[playerSub.status] ?? STATUS_STYLES.inactive}`}>
                                            {playerSub.status.replace('_', ' ')}
                                        </span>
                                        {periodLabel(playerSub) && (
                                            <span className="text-gray-500 text-sm">{periodLabel(playerSub)}</span>
                                        )}
                                    </div>
                                </div>
                                {isElite ? (
                                    <Link href="/pricing"
                                        className="shrink-0 bg-[#C8A951]/15 border border-[#C8A951]/50 text-[#C8A951] font-bold px-5 py-2.5 rounded-lg transition text-sm">
                                        Elite ✦
                                    </Link>
                                ) : (
                                    <Link href="/pricing"
                                        className="shrink-0 border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-5 py-2.5 rounded-lg transition text-sm">
                                        Upgrade
                                    </Link>
                                )}
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between gap-4 flex-wrap">
                                <p className="text-gray-500 text-xs">
                                    Upgrade anytime for the pro-rated cost of the year.
                                </p>
                                <form action={createPortalSession}>
                                    <button type="submit"
                                        className="text-[#C8A951]/70 hover:text-[#C8A951] text-sm font-medium transition shrink-0">
                                        Manage Subscription →
                                    </button>
                                </form>
                            </div>
                            <ConnectedLeagues
                                leagues={connectedLeagues}
                                limit={leagueLimit}
                                nextTier={nextTier}
                                tierLabel={formatTier(subscriptionTier)}
                            />
                        </>
                    ) : (
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <p className="text-gray-400 text-sm">No active player plan.</p>
                            <Link href="/pricing"
                                className="bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm">
                                View Plans
                            </Link>
                        </div>
                    )}
                </div>

                {/* ── Commissioner Plans ────────────────────────────────── */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Commissioner Plans</p>
                        <Link href="/pricing?tab=commissioner"
                            className="text-sm border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-4 py-1.5 rounded-lg transition">
                            + Add League
                        </Link>
                    </div>

                    {commSubs.length === 0 ? (
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <p className="text-gray-400 text-sm">No commissioner plans yet. Each plan covers one league you manage.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {commSubs.map((sub) => (
                                <div key={sub.id}
                                    className="flex items-center justify-between gap-4 flex-wrap p-4 bg-gray-800/40 rounded-xl border border-gray-800">
                                    <div>
                                        {sub.leagueName && (
                                            <p className="text-[#C8A951] font-semibold text-sm">{sub.leagueName}</p>
                                        )}
                                        <p className="font-medium text-gray-300 text-xs mt-0.5">{commLabel(sub.tier, sub.leagueSize)}</p>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[sub.status] ?? STATUS_STYLES.inactive}`}>
                                                {sub.status.replace('_', ' ')}
                                            </span>
                                            {sub.discountPct != null && sub.discountPct > 0 && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-green-900/40 text-green-400 border-green-800">
                                                    {sub.discountPct}% discount
                                                </span>
                                            )}
                                            {periodLabel(sub) && (
                                                <span className="text-gray-500 text-xs">{periodLabel(sub)}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0">
                                        {COMM_TIER_BADGE[sub.tier] && (
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${COMM_TIER_BADGE[sub.tier].className}`}>
                                                {COMM_TIER_BADGE[sub.tier].label}
                                            </span>
                                        )}
                                        <form action={createPortalSession}>
                                            <button type="submit"
                                                className="text-[#C8A951]/70 hover:text-[#C8A951] text-sm font-medium transition">
                                                Manage →
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Synced Leagues ────────────────────────────────────── */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold text-lg">Synced Leagues</h2>
                            <p className="text-gray-500 text-sm">{leagues.length} league{leagues.length !== 1 ? 's' : ''}</p>
                        </div>
                        <Link href="/dashboard/sync"
                            className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-4 py-2 rounded-lg transition">
                            + Sync League
                        </Link>
                    </div>

                    {leagues.length === 0 ? (
                        <div className="px-6 py-14 text-center">
                            <p className="text-gray-400 mb-1">No leagues synced yet.</p>
                            <p className="text-gray-600 text-sm mb-4">Connect your Sleeper account to get started.</p>
                            <Link href="/dashboard/sync"
                                className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm">
                                Sync a Sleeper League
                            </Link>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-800/50">
                            {leagues.map((league) => (
                                <li key={league.id}
                                    className="relative flex items-center gap-4 px-6 py-4 hover:bg-gray-800/30 hover:border-l-2 hover:border-l-[#C8A951]/40 transition-all group">
                                    <Link href={`/dashboard/league/${league.id}`} className="absolute inset-0" aria-label={league.leagueName} />
                                    {league.avatar ? (
                                        <Image
                                            src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                            alt={league.leagueName} width={40} height={40}
                                            className="rounded-lg shrink-0" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center text-gray-600 text-xs font-bold">
                                            FF
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-white truncate group-hover:text-[#C8A951] transition-colors">{league.leagueName}</p>
                                        <p className="text-gray-500 text-xs mt-0.5 capitalize">
                                            {league.platform} · {league.season} · {league.totalRosters} teams
                                            {league.scoringType ? ` · ${league.scoringType.toUpperCase().replace('_', ' ')}` : ''}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${LEAGUE_STATUS_STYLES[league.status] ?? LEAGUE_STATUS_STYLES.complete}`}>
                                        {leagueStatusLabel(league.status)}
                                    </span>
                                    <span className="text-gray-600 text-xs shrink-0 hidden sm:block">
                                        {league.lastSyncedAt ? new Date(league.lastSyncedAt).toLocaleDateString() : 'Never'}
                                    </span>
                                    <form action={unsyncLeague.bind(null, league.leagueId)} className="relative z-10">
                                        <button type="submit"
                                            className="shrink-0 text-gray-600 hover:text-red-400 transition text-sm px-2 py-1 rounded"
                                            title="Unsync">
                                            ✕
                                        </button>
                                    </form>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* ── Quick actions ─────────────────────────────────────── */}
                <div>
                    <h2 className="font-semibold text-lg mb-4">Quick Actions</h2>
                    <div className="grid sm:grid-cols-3 gap-3">
                        <Link href="/dashboard/sync"
                            className="bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-xl p-5 transition group">
                            <div className="text-2xl mb-2">🔗</div>
                            <p className="font-semibold text-white group-hover:text-[#C8A951] transition">Sync a League</p>
                            <p className="text-gray-500 text-sm mt-0.5">Connect your Sleeper account</p>
                        </Link>
                        <Link href="/dashboard/commissioner"
                            className="bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-xl p-5 transition group">
                            <div className="text-2xl mb-2">🏆</div>
                            <p className="font-semibold text-white group-hover:text-[#C8A951] transition">Commissioner Hub</p>
                            <p className="text-gray-500 text-sm mt-0.5">Manage your league</p>
                        </Link>
                        <Link href="/pricing"
                            className="bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-xl p-5 transition group">
                            <div className="text-2xl mb-2">💳</div>
                            <p className="font-semibold text-white group-hover:text-[#C8A951] transition">Manage Subscription</p>
                            <p className="text-gray-500 text-sm mt-0.5">
                                {!hasAnyActiveSub ? 'View plans and pricing' : isElite ? 'Billing and plan details' : 'Plans, billing, and upgrades'}
                            </p>
                        </Link>
                    </div>
                </div>

            </div>
        </main>
    );
}
