import Link from 'next/link';
import Image from 'next/image';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createPortalSession } from '@/app/actions/stripe';
import AssignLeagueToPlan from '../../_components/AssignLeagueToPlan';
import UnassignLeague from '../../_components/UnassignLeague';

const STATUS_STYLES: Record<string, string> = {
    active:   'bg-green-900/40 text-green-400 border-green-800',
    trialing: 'bg-blue-900/40 text-blue-400 border-blue-800',
    past_due: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    canceled: 'bg-red-900/40 text-red-400 border-red-800',
    inactive: 'bg-gray-800 text-gray-500 border-gray-700',
};

function formatTier(tier: string): string {
    switch (tier) {
        case 'COMMISSIONER_PRO':     return 'Commissioner Pro';
        case 'COMMISSIONER_ALL_PRO': return 'Commissioner All-Pro';
        case 'COMMISSIONER_ELITE':   return 'Commissioner Elite';
        default:                     return tier;
    }
}

function scoringLabel(s: string | null) {
    if (s === 'ppr')      return 'PPR';
    if (s === 'half_ppr') return '0.5 PPR';
    if (s === 'std')      return 'Std';
    return s ?? '—';
}

const COMM_FEATURES = [
    { href: '/dashboard/commissioner/dues',          icon: '💰', title: 'Dues & Payout Tracker',       desc: 'Track every dollar in and out.' },
    { href: '/dashboard/commissioner/announcements', icon: '📣', title: 'Commissioner Announcements',   desc: 'Rulebook, bylaws, and league docs.' },
    { href: '/dashboard/commissioner/calendar',      icon: '📅', title: 'Season Calendar',              desc: 'Trade deadlines, playoff schedule.' },
    { href: '/dashboard/commissioner/settings',      icon: '⚙️', title: 'League Settings Sync',        desc: 'Review settings across all leagues.' },
    { href: '/dashboard/commissioner/pro-bowl',      icon: '🏆', title: 'Pro Bowl Contest',             desc: 'Week 18 DK-style lineup contest.' },
] as const;

export default async function CommissionerPlanPage({
    params,
}: {
    params: Promise<{ subId: string }>;
}) {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const { subId } = await params;

    const sub = await prisma.subscription.findFirst({
        where: { id: subId, userId: session.user.id, type: 'commissioner' },
        select: {
            id: true, tier: true, status: true, leagueName: true, leagueSize: true,
            currentPeriodEnd: true, cancelAtPeriodEnd: true,
        },
    });
    if (!sub) notFound();

    const allLeagues = await prisma.league.findMany({
        where: { userId: session.user.id },
        orderBy: { leagueName: 'asc' },
        select: {
            id: true, leagueName: true, totalRosters: true,
            scoringType: true, avatar: true,
            assignedPlanId: true, assignedPlanType: true,
        },
    });

    const assignedLeague   = allLeagues.find(l => l.assignedPlanId === sub.id) ?? null;
    const unassignedLeagues = allLeagues.filter(l => !l.assignedPlanId);

    const tier       = sub.tier as string;
    const isElite    = tier === 'COMMISSIONER_ELITE';
    const isAllPro   = tier === 'COMMISSIONER_ALL_PRO';

    const renewalDate = sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto space-y-6">

                {/* Header */}
                <div>
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Your Commissioner Plan</h1>
                    {sub.leagueName && (
                        <p className="text-gray-400 text-sm mt-1">{sub.leagueName}</p>
                    )}
                </div>

                {/* Plan Summary Card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Commissioner Plan</p>
                            <p className="text-2xl font-bold text-[#C8A951]">{formatTier(tier)}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[sub.status] ?? STATUS_STYLES.inactive}`}>
                                    {sub.status.replace('_', ' ')}
                                </span>
                                {sub.leagueSize && (
                                    <span className="text-gray-500 text-sm">{sub.leagueSize}-team league</span>
                                )}
                                {sub.cancelAtPeriodEnd && renewalDate && (
                                    <span className="text-gray-500 text-sm">Cancels {renewalDate}</span>
                                )}
                                {!sub.cancelAtPeriodEnd && renewalDate && (
                                    <span className="text-gray-500 text-sm">Renews {renewalDate}</span>
                                )}
                            </div>
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

                {/* Assigned League */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                        <h2 className="font-semibold">League Assigned to This Plan</h2>
                        {!assignedLeague && unassignedLeagues.length > 0 && (
                            <AssignLeagueToPlan
                                planId={sub.id}
                                planType="commissioner"
                                unassignedLeagues={unassignedLeagues}
                            />
                        )}
                    </div>

                    {!assignedLeague ? (
                        <div className="px-6 py-10 text-center space-y-3">
                            <p className="text-gray-400 text-sm">No league assigned yet.</p>
                            <p className="text-gray-600 text-xs">
                                Link a synced league to enable commissioner tools for it.
                            </p>
                            {unassignedLeagues.length === 0 && (
                                <Link href="/dashboard/sync"
                                    className="inline-block text-sm border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-4 py-2 rounded-lg transition">
                                    Sync a League First
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="px-6 py-5">
                            <div className="flex items-center gap-4 p-4 bg-gray-800/40 rounded-xl border border-gray-700">
                                {assignedLeague.avatar ? (
                                    <Image
                                        src={`https://sleepercdn.com/avatars/thumbs/${assignedLeague.avatar}`}
                                        alt={assignedLeague.leagueName} width={44} height={44}
                                        className="rounded-lg shrink-0" />
                                ) : (
                                    <div className="w-11 h-11 rounded-lg bg-gray-700 shrink-0 flex items-center justify-center text-gray-500 text-xs font-bold">FF</div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <Link href={`/dashboard/league/${assignedLeague.id}`}
                                        className="font-semibold text-white hover:text-[#C8A951] transition truncate block">
                                        {assignedLeague.leagueName}
                                    </Link>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className="text-xs text-gray-500">Sleeper · {assignedLeague.totalRosters} teams</span>
                                        {assignedLeague.scoringType && (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 border border-gray-600">
                                                {scoringLabel(assignedLeague.scoringType)}
                                            </span>
                                        )}
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-800">
                                            Commissioner Paid
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    {unassignedLeagues.length > 0 && (
                                        <AssignLeagueToPlan
                                            planId={sub.id}
                                            planType="commissioner"
                                            unassignedLeagues={unassignedLeagues}
                                            currentLeagueId={assignedLeague.id}
                                        />
                                    )}
                                    <UnassignLeague leagueId={assignedLeague.id} leagueName={assignedLeague.leagueName} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Commissioner Tools */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800">
                        <h2 className="font-semibold">Commissioner Tools Included</h2>
                        <p className="text-gray-500 text-xs mt-0.5">Everything in your plan, ready to use.</p>
                    </div>
                    <div className="divide-y divide-gray-800/50">
                        {COMM_FEATURES.map(f => (
                            <Link
                                key={f.href}
                                href={f.href}
                                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-800/30 transition group"
                            >
                                <span className="text-xl shrink-0">{f.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-white group-hover:text-[#C8A951] transition text-sm">{f.title}</p>
                                    <p className="text-gray-500 text-xs mt-0.5">{f.desc}</p>
                                </div>
                                <span className="text-gray-600 group-hover:text-[#C8A951] transition text-sm shrink-0">→</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Upgrade Section */}
                {!isElite && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                        <h2 className="font-semibold">Upgrade Your Commissioner Plan</h2>
                        <div className="space-y-3">
                            {!isAllPro && !isElite && (
                                <div className="flex items-center justify-between gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                                    <div>
                                        <p className="font-medium text-white text-sm">Commissioner All-Pro</p>
                                        <p className="text-gray-500 text-xs mt-0.5">Advanced dues tracking · Payout proposals · Polls</p>
                                    </div>
                                    <Link
                                        href={`/pricing?tab=commissioner&size=${sub.leagueSize ?? 12}&leagueName=${encodeURIComponent(sub.leagueName ?? '')}`}
                                        className="shrink-0 border border-gray-600 hover:border-[#C8A951]/60 text-gray-300 font-semibold px-4 py-2 rounded-lg transition text-sm">
                                        Upgrade →
                                    </Link>
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-4 p-4 bg-[#C8A951]/5 rounded-xl border border-[#C8A951]/20">
                                <div>
                                    <p className="font-medium text-[#C8A951] text-sm">Commissioner Elite ✦</p>
                                    <p className="text-gray-500 text-xs mt-0.5">All features · Priority support · Future tools first</p>
                                </div>
                                <Link
                                    href={`/pricing?tab=commissioner&size=${sub.leagueSize ?? 12}&leagueName=${encodeURIComponent(sub.leagueName ?? '')}`}
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
