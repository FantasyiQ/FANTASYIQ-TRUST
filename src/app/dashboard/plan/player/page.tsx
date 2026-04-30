import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, priceIdToTier } from '@/lib/stripe';
import { createPortalSession } from '@/app/actions/stripe';
import { getLeagueLimit, tierToLimitKey } from '@/lib/league-limits';
import type { SubscriptionTier } from '@prisma/client';
import AssignLeagueToPlan from '../_components/AssignLeagueToPlan';
import UnassignLeague from '../_components/UnassignLeague';

const STATUS_STYLES: Record<string, string> = {
    active:   'bg-green-900/40 text-green-400 border-green-800',
    trialing: 'bg-blue-900/40 text-blue-400 border-blue-800',
    past_due: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    canceled: 'bg-red-900/40 text-red-400 border-red-800',
    inactive: 'bg-gray-800 text-gray-500 border-gray-700',
};

function formatTier(tier: string): string {
    switch (tier) {
        case 'PLAYER_PRO':     return 'Player Pro';
        case 'PLAYER_ALL_PRO': return 'Player All-Pro';
        case 'PLAYER_ELITE':   return 'Player Elite';
        default:               return tier;
    }
}

function scoringLabel(s: string | null) {
    if (s === 'ppr')      return 'PPR';
    if (s === 'half_ppr') return '0.5 PPR';
    if (s === 'std')      return 'Std';
    return s ?? '—';
}

export default async function PlayerPlanPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            subscriptions: {
                where: { type: 'player', status: { in: ['active', 'trialing'] } },
                select: {
                    id: true, tier: true, status: true,
                    stripeSubscriptionId: true,
                    currentPeriodEnd: true, cancelAtPeriodEnd: true,
                },
            },
            leagues: {
                orderBy: { leagueName: 'asc' },
                select: {
                    id: true, leagueName: true, totalRosters: true,
                    scoringType: true, avatar: true,
                    assignedPlanId: true, assignedPlanType: true,
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    const rawSub = user.subscriptions[0] ?? null;
    if (!rawSub) redirect('/pricing?tab=player');

    // Verify tier against Stripe (same healing logic as dashboard)
    let tier = rawSub.tier as string;
    if (rawSub.stripeSubscriptionId) {
        try {
            const stripeSub = await stripe.subscriptions.retrieve(rawSub.stripeSubscriptionId);
            const priceId   = stripeSub.items.data[0]?.price.id;
            const verified  = priceId ? priceIdToTier(priceId) : null;
            if (verified) {
                tier = verified;
                if (verified !== rawSub.tier) {
                    prisma.subscription.update({
                        where: { id: rawSub.id },
                        data: { tier: verified as SubscriptionTier },
                    }).catch(() => {});
                }
            }
        } catch {
            // Stripe unreachable — use DB value
        }
    }

    const sub = { ...rawSub, tier };

    const assignedLeagues   = user.leagues.filter(l => l.assignedPlanId === sub.id);
    const unassignedLeagues = user.leagues.filter(l => !l.assignedPlanId);

    const leagueLimit = getLeagueLimit(tierToLimitKey(tier));
    const atLimit     = leagueLimit !== Infinity && assignedLeagues.length >= leagueLimit;

    const renewalDate = sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;

    const isElite   = tier === 'PLAYER_ELITE';
    const isAllPro  = tier === 'PLAYER_ALL_PRO';
    const isPro     = tier === 'PLAYER_PRO';

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto space-y-6">

                {/* Header */}
                <div>
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Your Player Plan</h1>
                    <p className="text-gray-400 text-sm mt-1">Manage your plan and assigned leagues.</p>
                </div>

                {/* Plan Summary Card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Player Plan</p>
                            <p className="text-2xl font-bold text-[#C8A951]">{formatTier(tier)}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[sub.status] ?? STATUS_STYLES.inactive}`}>
                                    {sub.status.replace('_', ' ')}
                                </span>
                                {sub.cancelAtPeriodEnd && renewalDate && (
                                    <span className="text-gray-500 text-sm">Cancels {renewalDate}</span>
                                )}
                                {!sub.cancelAtPeriodEnd && renewalDate && (
                                    <span className="text-gray-500 text-sm">Renews {renewalDate}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <span className="text-sm text-gray-400">
                                {leagueLimit === Infinity
                                    ? `${assignedLeagues.length} league${assignedLeagues.length !== 1 ? 's' : ''} assigned`
                                    : `${assignedLeagues.length} / ${leagueLimit} league${leagueLimit !== 1 ? 's' : ''}`}
                            </span>
                        </div>
                    </div>
                    <div className="pt-3 border-t border-gray-800">
                        <form action={createPortalSession}>
                            <button type="submit"
                                className="text-[#C8A951]/70 hover:text-[#C8A951] text-sm font-medium transition">
                                Manage Subscription →
                            </button>
                        </form>
                    </div>
                </div>

                {/* Assigned Leagues */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                        <h2 className="font-semibold">Leagues Assigned to This Plan</h2>
                        {!atLimit && unassignedLeagues.length > 0 && (
                            <AssignLeagueToPlan
                                planId={sub.id}
                                planType="player"
                                unassignedLeagues={unassignedLeagues}
                            />
                        )}
                    </div>

                    {assignedLeagues.length === 0 ? (
                        <div className="px-6 py-10 text-center space-y-3">
                            <p className="text-gray-400 text-sm">No leagues assigned yet.</p>
                            <p className="text-gray-600 text-xs">
                                Assign a synced league to unlock player-plan features for that league.
                            </p>
                            {unassignedLeagues.length > 0 ? (
                                <div className="pt-2">
                                    <AssignLeagueToPlan
                                        planId={sub.id}
                                        planType="player"
                                        unassignedLeagues={unassignedLeagues}
                                    />
                                </div>
                            ) : (
                                <Link href="/dashboard/sync"
                                    className="inline-block text-sm border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-4 py-2 rounded-lg transition">
                                    Sync a League First
                                </Link>
                            )}
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-800/50">
                            {assignedLeagues.map(league => (
                                <li key={league.id} className="flex items-center gap-4 px-6 py-4">
                                    {league.avatar ? (
                                        <Image
                                            src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                            alt={league.leagueName} width={36} height={36}
                                            className="rounded-lg shrink-0" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center text-gray-600 text-xs font-bold">FF</div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <Link href={`/dashboard/league/${league.id}`}
                                            className="font-medium text-white hover:text-[#C8A951] transition truncate block">
                                            {league.leagueName}
                                        </Link>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <span className="text-xs text-gray-500">Sleeper</span>
                                            {league.scoringType && (
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                                                    {scoringLabel(league.scoringType)}
                                                </span>
                                            )}
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-800">
                                                Active
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <AssignLeagueToPlan
                                            planId={sub.id}
                                            planType="player"
                                            unassignedLeagues={unassignedLeagues}
                                            currentLeagueId={league.id}
                                        />
                                        <UnassignLeague leagueId={league.id} leagueName={league.leagueName} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {atLimit && (
                        <div className="px-6 py-3 border-t border-gray-800 bg-yellow-900/10">
                            <p className="text-yellow-400 text-xs">
                                League limit reached ({leagueLimit}). Upgrade your plan to assign more leagues.
                            </p>
                        </div>
                    )}
                </div>

                {/* Unassigned Leagues */}
                {unassignedLeagues.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800">
                            <h2 className="font-semibold">Unassigned Leagues</h2>
                            <p className="text-gray-500 text-xs mt-0.5">These leagues are synced but not linked to any plan.</p>
                        </div>
                        <ul className="divide-y divide-gray-800/50">
                            {unassignedLeagues.map(league => (
                                <li key={league.id} className="flex items-center gap-4 px-6 py-4">
                                    {league.avatar ? (
                                        <Image
                                            src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                            alt={league.leagueName} width={36} height={36}
                                            className="rounded-lg shrink-0" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center text-gray-600 text-xs font-bold">FF</div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <Link href={`/dashboard/league/${league.id}`}
                                            className="font-medium text-white hover:text-[#C8A951] transition truncate block">
                                            {league.leagueName}
                                        </Link>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-gray-500">Sleeper · {league.totalRosters} teams</span>
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400 border border-yellow-800">
                                                Unassigned
                                            </span>
                                        </div>
                                    </div>
                                    {!atLimit && (
                                        <AssignLeagueToPlan
                                            planId={sub.id}
                                            planType="player"
                                            unassignedLeagues={[league]}
                                        />
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Upgrade Section */}
                {!isElite && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                        <h2 className="font-semibold">Upgrade Your Player Plan</h2>
                        <div className="space-y-3">
                            {isPro && (
                                <div className="flex items-center justify-between gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                                    <div>
                                        <p className="font-medium text-white text-sm">Player All-Pro</p>
                                        <p className="text-gray-500 text-xs mt-0.5">Up to 5 assigned leagues · Full trade analytics</p>
                                    </div>
                                    <Link href="/pricing?tab=player"
                                        className="shrink-0 border border-gray-600 hover:border-[#C8A951]/60 text-gray-300 font-semibold px-4 py-2 rounded-lg transition text-sm">
                                        Upgrade →
                                    </Link>
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-4 p-4 bg-[#C8A951]/5 rounded-xl border border-[#C8A951]/20">
                                <div>
                                    <p className="font-medium text-[#C8A951] text-sm">Player Elite ✦</p>
                                    <p className="text-gray-500 text-xs mt-0.5">Unlimited leagues · Priority data · All features</p>
                                </div>
                                <Link href="/pricing?tab=player"
                                    className="shrink-0 bg-[#C8A951]/15 border border-[#C8A951]/50 text-[#C8A951] font-bold px-4 py-2 rounded-lg transition text-sm hover:bg-[#C8A951]/25">
                                    {isAllPro ? 'Upgrade →' : 'View Plans →'}
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}
