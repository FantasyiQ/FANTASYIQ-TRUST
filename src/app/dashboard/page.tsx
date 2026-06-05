import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, priceIdToTier } from '@/lib/stripe';
import { createPortalSession } from '@/app/actions/stripe';
import ConnectedLeagues from '@/components/ConnectedLeagues';
import SleeperLeaguesList from './SleeperLeaguesList';
import SyncedLeaguePicker from './SyncedLeaguePicker';
import { getLeagueLimit, tierToLimitKey, nextTierName } from '@/lib/league-limits';
import { computeAutoAssignments } from '@/lib/auto-assign';
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
    COMMISSIONER_PRO:     { label: 'PRO',      className: 'bg-gray-800 text-gray-300 border-gray-600' },
    COMMISSIONER_ALL_PRO: { label: 'ALL-PRO',  className: 'bg-[#D4AF37] text-black border-[#D4AF37]' },
    COMMISSIONER_ELITE:   { label: 'ELITE ✦',  className: 'bg-[#D4AF37]/25 text-[#D4AF37] border-[#D4AF37]/60' },
};

function periodLabel(sub: { cancelAtPeriodEnd: boolean; currentPeriodEnd: Date | null } | undefined) {
    if (!sub?.cancelAtPeriodEnd || !sub?.currentPeriodEnd) return null;
    const date = new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
    return `Cancels ${date}`;
}

export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params  = await searchParams;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            name: true,
            image: true,
            emailVerified: true,
            hashedPassword: true,
            onboardingComplete: true,
            subscriptionTier: true,
            subscriptions: {
                select: {
                    id: true,
                    type: true,
                    tier: true,
                    leagueSize: true,
                    leagueName: true,
                    status: true,
                    stripeSubscriptionId: true,
                    currentPeriodEnd: true,
                    cancelAtPeriodEnd: true,
                },
            },
            connectedLeagues: {
                orderBy: { createdAt: 'asc' },
                select: { id: true, leagueName: true, platform: true, createdAt: true },
            },
            leagues: {
                orderBy: { leagueName: 'asc' },
                select: {
                    id: true, leagueId: true, leagueName: true, platform: true,
                    season: true, status: true, totalRosters: true, scoringType: true,
                    avatar: true, standings: true, lastSyncedAt: true,
                    assignedPlanId: true, assignedPlanType: true,
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    // Redirect new users to onboarding if they haven't completed it and have no leagues yet
    if (!user.onboardingComplete && user.leagues.length === 0 && user.connectedLeagues.length === 0) {
        redirect('/onboarding');
    }

    // If they have leagues but never completed onboarding (e.g. legacy users), mark silently
    if (!user.onboardingComplete && (user.leagues.length > 0 || user.connectedLeagues.length > 0)) {
        await prisma.user.update({
            where: { email: session.user.email! },
            data:  { onboardingComplete: true },
        });
    }

    const { name, image, emailVerified, hashedPassword, subscriptionTier, subscriptions, leagues: rawLeagues } = user;

    // Deduplicate: Sleeper creates a new leagueId every season for the same league name.
    // Keep only the most recent season per league name so the dashboard shows one row per league.
    const _seenLeagueNames = new Map<string, typeof rawLeagues[0]>();
    for (const l of rawLeagues) {
        const key = l.leagueName.toLowerCase().trim();
        const existing = _seenLeagueNames.get(key);
        if (!existing || l.season > existing.season) _seenLeagueNames.set(key, l);
    }
    const leagues = [..._seenLeagueNames.values()].sort((a, b) => a.leagueName.localeCompare(b.leagueName));
    // Show verification banner only to credentials users who haven't verified yet
    const needsVerification = !emailVerified && !!hashedPassword;

    // Enrich connected leagues with the matching League.id so links always work
    const syncedIdByNameServer = new Map(leagues.map(l => [l.leagueName.toLowerCase().trim(), l.id]));
    const commissionerLeagueIds = new Set(
        leagues.filter(l => l.assignedPlanType === 'commissioner').map(l => l.id)
    );
    const connectedLeagues = user.connectedLeagues.map(cl => {
        const syncedLeagueId = syncedIdByNameServer.get(cl.leagueName.toLowerCase().trim());
        return {
            ...cl,
            syncedLeagueId,
            isCommissioner: !!syncedLeagueId && commissionerLeagueIds.has(syncedLeagueId),
        };
    });
    const displayName = (name ?? session.user.email ?? '').split(' ')[0];

    const activeSubs = subscriptions.filter(
        s => s.status === 'active' || s.status === 'trialing'
    );
    const rawPlayerSub = activeSubs.find(s => s.type === 'player') ?? null;
    // Deduplicate commissioner subs by league name — subscription recreation can leave
    // two active rows for the same league. Keep the one with the furthest period end.
    const _rawCommSubs = activeSubs.filter(s => s.type === 'commissioner');
    const _seenCommSubs = new Map<string, typeof _rawCommSubs[0]>();
    for (const s of _rawCommSubs) {
        const key = (s.leagueName ?? '').toLowerCase().trim();
        const ex  = _seenCommSubs.get(key);
        if (!ex || (s.currentPeriodEnd?.getTime() ?? 0) > (ex.currentPeriodEnd?.getTime() ?? 0)) {
            _seenCommSubs.set(key, s);
        }
    }
    const commSubs = [..._seenCommSubs.values()].sort((a, b) => (a.leagueName ?? '').localeCompare(b.leagueName ?? ''));

    // Verify player plan tier against Stripe — heals DB when webhook fires with stale metadata
    // (e.g. billing-portal upgrades where subscription metadata retains the original checkout tier)
    let playerSubTier: string = rawPlayerSub?.tier ?? 'FREE';
    if (rawPlayerSub?.stripeSubscriptionId) {
        try {
            const stripeSub = await stripe.subscriptions.retrieve(rawPlayerSub.stripeSubscriptionId);
            const currentPriceId = stripeSub.items.data[0]?.price.id;
            const stripeTier = currentPriceId ? priceIdToTier(currentPriceId) : null;
            if (stripeTier) {
                playerSubTier = stripeTier;
                // Passively heal stale tier fields in the background
                if (stripeTier !== rawPlayerSub.tier) {
                    prisma.subscription.update({
                        where: { id: rawPlayerSub.id },
                        data: { tier: stripeTier as SubscriptionTier },
                    }).catch(() => {});
                }
                if (stripeTier !== subscriptionTier) {
                    prisma.user.update({
                        where: { email: session.user.email! },
                        data: { subscriptionTier: stripeTier as SubscriptionTier },
                    }).catch(() => {});
                }
            }
        } catch {
            // Stripe unreachable — fall back to DB value
        }
    }
    const playerSub = rawPlayerSub ? { ...rawPlayerSub, tier: playerSubTier } : null;

    // ── Silent auto-assign ────────────────────────────────────────────────────
    // Any league that slipped through sync-time assignment (ESPN, cron-synced,
    // or old records) gets silently assigned here so the user never sees
    // "Unassigned" if a plan slot is available.
    const unassignedLeagues = leagues.filter(l => !l.assignedPlanId && !l.assignedPlanType);
    const leagueAssignmentOverrides = new Map<string, { assignedPlanId: string; assignedPlanType: string }>();

    if (unassignedLeagues.length > 0 && activeSubs.length > 0) {
        const playerSlotsUsed = leagues.filter(l => l.assignedPlanType === 'player').length;
        const planOptions = activeSubs.map(s => ({
            id: s.id, type: s.type as 'player' | 'commissioner',
            tier: s.tier, leagueName: s.leagueName ?? null,
        }));
        const assignments = computeAutoAssignments(unassignedLeagues, planOptions, playerSlotsUsed);
        const toUpdate = assignments.filter(a => a.planId !== null);

        for (const a of toUpdate) {
            leagueAssignmentOverrides.set(a.leagueDbId, {
                assignedPlanId:   a.planId!,
                assignedPlanType: a.planType!,
            });
        }

        // Persist in the background — individual updates (not a transaction) to avoid
        // row lock contention if the user deletes a league before the update completes.
        if (toUpdate.length > 0) {
            Promise.all(
                toUpdate.map(a => prisma.league.update({
                    where: { id: a.leagueDbId },
                    data:  { assignedPlanId: a.planId, assignedPlanType: a.planType },
                }).catch(() => {}))
            ).catch(() => {});
        }
    }

    // ── Silent commissioner promotion ─────────────────────────────────────────
    // Heals leagues stuck on a player plan when a commissioner sub exists for
    // that same league. This happens when:
    //   (a) the user bought the commissioner plan after initially syncing, and
    //   (b) the webhook's updateMany ran but found no League row (not yet synced),
    //       OR the name in the subscription differs from the Sleeper league name.
    // The sync route does the same check at sync time; this fires on every dashboard
    // load so the fix is instant without requiring a manual re-sync.
    if (commSubs.length > 0) {
        const playerAssigned = leagues.filter(l => l.assignedPlanType === 'player');
        const promotions: { leagueDbId: string; planId: string }[] = [];

        for (const league of playerAssigned) {
            if (leagueAssignmentOverrides.has(league.id)) continue; // already handled above
            const match = commSubs.find(
                s => s.leagueName?.toLowerCase().trim() === league.leagueName.toLowerCase().trim()
            );
            if (match) {
                promotions.push({ leagueDbId: league.id, planId: match.id });
                leagueAssignmentOverrides.set(league.id, {
                    assignedPlanId:   match.id,
                    assignedPlanType: 'commissioner',
                });
            }
        }

        if (promotions.length > 0) {
            Promise.all(
                promotions.map(p => prisma.league.update({
                    where: { id: p.leagueDbId },
                    data:  { assignedPlanId: p.planId, assignedPlanType: 'commissioner' },
                }).catch(() => {}))
            ).catch(() => {});
        }
    }

    // Enrich leagues array with any auto-assignments computed above
    const enrichedLeagues = leagues.map(l => {
        const override = leagueAssignmentOverrides.get(l.id);
        return override ? { ...l, ...override } : l;
    });

    // Build a set of league IDs that are over the plan limit (for UI hint)
    const limitReachedIds = new Set(
        unassignedLeagues
            .filter(l => {
                const a = computeAutoAssignments(
                    [l],
                    activeSubs.map(s => ({ id: s.id, type: s.type as 'player' | 'commissioner', tier: s.tier, leagueName: s.leagueName ?? null })),
                    enrichedLeagues.filter(x => x.assignedPlanType === 'player').length,
                ).at(0);
                return a?.limitReached;
            })
            .map(l => l.id)
    );

    const syncedLeagueIdByName = new Map(
        leagues.map(l => [l.leagueName.toLowerCase().trim(), l.id])
    );

    const hasPastDueSub = subscriptions.some(s => s.status === 'past_due');
    const hasAnyActiveSub = activeSubs.length > 0;
    const displayTier = (playerSubTier !== 'FREE' ? playerSubTier : subscriptionTier) as SubscriptionTier;
    const isElite = displayTier === 'PLAYER_ELITE' || displayTier === 'COMMISSIONER_ELITE';

    const leagueLimitKey = tierToLimitKey(displayTier);
    const leagueLimit    = getLeagueLimit(leagueLimitKey);
    const nextTier       = nextTierName(displayTier);

    // Elite = unlimited: rebuild list entirely from synced leagues so every entry has a link.
    // Overlay existing connectedLeague records (by name) to preserve lock / createdAt info.
    // Any connected-but-not-synced entries appear at the end (no link — they have no League.id).
    const effectiveConnectedLeagues = leagueLimit === Infinity
        ? (() => {
            const connectedByName = new Map(
                user.connectedLeagues.map(cl => [cl.leagueName.toLowerCase().trim(), cl])
            );
            const syncedLeagueNames = new Set(leagues.map(l => l.leagueName.toLowerCase().trim()));

            // All synced leagues — exclude commissioner-covered ones (they appear in
            // the Commissioner Plans section, not under Player Plan).
            const fromSynced = leagues.filter(l => !commissionerLeagueIds.has(l.id)).map(l => {
                const existing = connectedByName.get(l.leagueName.toLowerCase().trim());
                return {
                    id:             existing?.id ?? `auto-${l.id}`,
                    leagueName:     l.leagueName,
                    platform:       l.platform,
                    createdAt:      existing ? existing.createdAt : new Date(0).toISOString(),
                    syncedLeagueId: l.id,
                    isCommissioner: commissionerLeagueIds.has(l.id),
                    isAutoIncluded: !existing,
                };
            });

            // Connected leagues with no matching synced record (show without link)
            const orphans = user.connectedLeagues
                .filter(cl => !syncedLeagueNames.has(cl.leagueName.toLowerCase().trim()))
                .map(cl => ({
                    ...cl,
                    syncedLeagueId: undefined,
                    isCommissioner: false,
                    isAutoIncluded: false,
                }));

            return [...fromSynced, ...orphans].sort((a, b) =>
                a.leagueName.localeCompare(b.leagueName)
            );
        })()
        : connectedLeagues.filter(cl => !cl.isCommissioner);

    const testDataReset = params.test_data_reset === 'true';

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Payment failed banner */}
                {hasPastDueSub && (
                    <div className="rounded-xl bg-yellow-900/20 border border-yellow-700/50 px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
                        <p className="text-yellow-400 font-medium text-sm">
                            ⚠️ Your last payment failed. Update your payment method to keep your plan active.
                        </p>
                        <a href="/dashboard/plan/player" className="text-yellow-300 font-semibold text-sm hover:underline shrink-0">
                            Update payment →
                        </a>
                    </div>
                )}

                {/* Email verified success banner */}
                {params.verified === '1' && (
                    <div className="rounded-xl bg-[#0F3D2E] border border-emerald-500/40 px-5 py-3.5">
                        <p className="text-emerald-400 font-medium text-sm">
                            Email verified — your account is confirmed.
                        </p>
                    </div>
                )}

                {/* Email verification nudge */}
                {needsVerification && params.verified !== '1' && (
                    <div className="rounded-xl bg-blue-900/20 border border-blue-700/50 px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
                        <p className="text-blue-300 text-sm">
                            Please verify your email address to secure your account.
                        </p>
                        <a href="/dashboard/account" className="text-blue-200 font-semibold text-sm hover:underline shrink-0">
                            Verify email →
                        </a>
                    </div>
                )}

                {/* Test data reset banner */}
                {testDataReset && (
                    <div className="rounded-xl bg-[#0F3D2E] border border-emerald-500/40 px-5 py-3.5">
                        <p className="text-emerald-400 font-medium text-sm">
                            Test data reset — your account is now clean.
                        </p>
                    </div>
                )}

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

                </div>

                {/* ── Onboarding (new users with no leagues) ───────────── */}
                {leagues.length === 0 && !hasAnyActiveSub && (
                    <div className="bg-gradient-to-br from-[#D4AF37]/10 to-gray-900 border border-[#D4AF37]/30 rounded-2xl p-6 space-y-5">
                        <div>
                            <h2 className="text-lg font-bold text-white">Get started with FiQ</h2>
                            <p className="text-gray-400 text-sm mt-1">Follow these steps to unlock your full fantasy edge.</p>
                        </div>
                        <ol className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="mt-0.5 w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-xs flex items-center justify-center shrink-0">✓</span>
                                <div>
                                    <p className="text-sm font-semibold text-white">Create your account</p>
                                    <p className="text-xs text-gray-500">Done — you&apos;re in.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="mt-0.5 w-5 h-5 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] text-xs flex items-center justify-center shrink-0 font-bold">2</span>
                                <div>
                                    <p className="text-sm font-semibold text-white">Connect your leagues</p>
                                    <p className="text-xs text-gray-500 mb-2">Sync from Sleeper, ESPN, Yahoo, or NFL.com to see standings, rosters, and trade values.</p>
                                    <div className="flex flex-wrap gap-2">
                                        <Link href="/dashboard/sync" className="inline-flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold text-xs px-3 py-1.5 rounded-lg transition">
                                            Sync Sleeper →
                                        </Link>
                                        <Link href="/dashboard/sync/espn" className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-xs px-3 py-1.5 rounded-lg transition">
                                            Sync ESPN
                                        </Link>
                                        <Link href="/dashboard/sync/yahoo" className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-xs px-3 py-1.5 rounded-lg transition">
                                            Sync Yahoo
                                        </Link>
                                        <Link href="/dashboard/sync/nfl" className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-xs px-3 py-1.5 rounded-lg transition">
                                            Sync NFL
                                        </Link>
                                    </div>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="mt-0.5 w-5 h-5 rounded-full bg-gray-800 border border-gray-700 text-gray-600 text-xs flex items-center justify-center shrink-0 font-bold">3</span>
                                <div>
                                    <p className="text-sm font-semibold text-gray-400">Explore trade values &amp; analytics</p>
                                    <p className="text-xs text-gray-600">Dynasty trade values, roster grades, start/sit — powered by live KTC data.</p>
                                </div>
                            </li>
                        </ol>
                    </div>
                )}

                {/* ── Player Plan ───────────────────────────────────────── */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">Player Plan</p>

                    {playerSub ? (
                        <>
                            <div className="flex items-start justify-between gap-6 flex-wrap">
                                <div>
                                    <p className="text-2xl font-bold text-[#D4AF37]">{formatTier(playerSub.tier)}</p>
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
                                        className="shrink-0 bg-[#D4AF37]/15 border border-[#D4AF37]/50 text-[#D4AF37] font-bold px-5 py-2.5 rounded-lg transition text-sm">
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
                                <Link href="/dashboard/plan/player"
                                    className="text-[#D4AF37]/70 hover:text-[#D4AF37] text-sm font-medium transition shrink-0">
                                    View Plan Details →
                                </Link>
                                <form action={createPortalSession}>
                                    <button type="submit"
                                        className="text-gray-500 hover:text-gray-300 text-sm font-medium transition shrink-0">
                                        Manage Subscription →
                                    </button>
                                </form>
                            </div>
                            <ConnectedLeagues
                                leagues={effectiveConnectedLeagues}
                                syncedLeagues={leagues.map(l => ({
                                    id: l.id,
                                    leagueName: l.leagueName,
                                    season: l.season,
                                    totalRosters: l.totalRosters,
                                }))}
                                limit={leagueLimit}
                                nextTier={nextTier}
                                tierLabel={formatTier(displayTier)}
                            />
                        </>
                    ) : (
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <p className="text-gray-400 text-sm">No active player plan.</p>
                            <Link href="/pricing"
                                className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm">
                                View Plans
                            </Link>
                        </div>
                    )}
                </div>

                {/* ── Commissioner Plans ────────────────────────────────── */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Commissioner Plans</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <SyncedLeaguePicker leagues={leagues.map(l => ({
                                id: l.id,
                                leagueName: l.leagueName,
                                totalRosters: l.totalRosters,
                                season: l.season,
                                scoringType: l.scoringType ?? null,
                            }))} />
                            <Link href="/pricing?tab=commissioner&mode=new"
                                className="text-sm border border-gray-700 hover:border-[#D4AF37]/50 text-gray-300 font-semibold px-4 py-1.5 rounded-lg transition">
                                + Add League
                            </Link>
                        </div>
                    </div>

                    {commSubs.length === 0 ? (
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <p className="text-gray-400 text-sm">No commissioner plans yet. Each plan covers one league you manage.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {commSubs.map((sub) => (
                                <div key={sub.id}
                                    className="flex flex-col p-4 bg-gray-800/40 rounded-xl border border-gray-800">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            {sub.leagueName && (() => {
                                                const leagueId = syncedLeagueIdByName.get(sub.leagueName.toLowerCase().trim());
                                                // Partial match fallback — handles minor name differences
                                                const partialMatch = !leagueId
                                                    ? leagues.find(l => l.leagueName.toLowerCase().includes(sub.leagueName!.toLowerCase().trim()) || sub.leagueName!.toLowerCase().trim().includes(l.leagueName.toLowerCase()))
                                                    : null;
                                                const resolvedId = leagueId ?? partialMatch?.id;
                                                return resolvedId ? (
                                                    <Link href={`/dashboard/league/${resolvedId}/overview`}
                                                        className="text-[#D4AF37] font-semibold text-sm hover:underline">
                                                        {sub.leagueName} →
                                                    </Link>
                                                ) : (
                                                    <p className="text-[#D4AF37] font-semibold text-sm">{sub.leagueName}</p>
                                                );
                                            })()}
                                            <p className="font-medium text-gray-300 text-xs mt-0.5">{commLabel(sub.tier, sub.leagueSize)}</p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[sub.status] ?? STATUS_STYLES.inactive}`}>
                                                    {sub.status.replace('_', ' ')}
                                                </span>
                                                {periodLabel(sub) && (
                                                    <span className="text-gray-500 text-xs">{periodLabel(sub)}</span>
                                                )}
                                            </div>
                                        </div>
                                        {COMM_TIER_BADGE[sub.tier] && (
                                            sub.tier === 'COMMISSIONER_ELITE' ? (
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${COMM_TIER_BADGE[sub.tier].className}`}>
                                                    {COMM_TIER_BADGE[sub.tier].label}
                                                </span>
                                            ) : (
                                                <Link
                                                    href={`/pricing?tab=commissioner&size=${sub.leagueSize ?? 12}&leagueName=${encodeURIComponent(sub.leagueName ?? '')}`}
                                                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border shrink-0 transition hover:opacity-80 ${COMM_TIER_BADGE[sub.tier].className}`}>
                                                    {COMM_TIER_BADGE[sub.tier].label} ↑
                                                </Link>
                                            )
                                        )}
                                    </div>
                                    <div className="flex justify-end items-center gap-4 mt-3">
                                        <Link href={`/dashboard/plan/commissioner/${sub.id}`}
                                            className="text-[#D4AF37]/70 hover:text-[#D4AF37] text-sm font-medium transition">
                                            View Details →
                                        </Link>
                                        <form action={createPortalSession}>
                                            <button type="submit"
                                                className="text-gray-500 hover:text-gray-300 text-sm font-medium transition">
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
                {(() => {
                    const sleeperLeagues = enrichedLeagues.filter(l => l.platform === 'sleeper');
                    const espnLeagues    = enrichedLeagues.filter(l => l.platform === 'espn');
                    const yahooLeagues   = enrichedLeagues.filter(l => l.platform === 'yahoo');
                    const nflLeagues     = enrichedLeagues.filter(l => l.platform === 'nfl');
                    return (
                        <>
                            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                                    <div>
                                        <h2 className="font-semibold text-lg">Sleeper Leagues</h2>
                                        <p className="text-gray-500 text-sm">{sleeperLeagues.length} league{sleeperLeagues.length !== 1 ? 's' : ''} · syncs hourly</p>
                                    </div>
                                    <Link href="/dashboard/sync"
                                        className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-4 py-2 rounded-lg transition">
                                        + Sync League
                                    </Link>
                                </div>
                                <SleeperLeaguesList
                                    leagues={sleeperLeagues}
                                    playerTier={playerSubTier}
                                    commSubs={commSubs.map(s => ({ leagueName: s.leagueName, tier: s.tier }))}
                                    hasPlayerPlan={!!playerSub}
                                    limitReachedIds={limitReachedIds}
                                />
                            </div>

                            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                                    <div>
                                        <h2 className="font-semibold text-lg">ESPN Leagues</h2>
                                        <p className="text-gray-500 text-sm">{espnLeagues.length} league{espnLeagues.length !== 1 ? 's' : ''} · syncs hourly</p>
                                    </div>
                                    <Link href="/dashboard/sync/espn"
                                        className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-4 py-2 rounded-lg transition">
                                        + Sync League
                                    </Link>
                                </div>
                                <SleeperLeaguesList
                                    leagues={espnLeagues}
                                    playerTier={playerSubTier}
                                    commSubs={commSubs.map(s => ({ leagueName: s.leagueName, tier: s.tier }))}
                                    platform="espn"
                                    hasPlayerPlan={!!playerSub}
                                    limitReachedIds={limitReachedIds}
                                />
                            </div>

                            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                                    <div>
                                        <h2 className="font-semibold text-lg">Yahoo Leagues</h2>
                                        <p className="text-gray-500 text-sm">{yahooLeagues.length} league{yahooLeagues.length !== 1 ? 's' : ''} · syncs hourly</p>
                                    </div>
                                    <Link href="/dashboard/sync/yahoo"
                                        className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-4 py-2 rounded-lg transition">
                                        + Sync League
                                    </Link>
                                </div>
                                <SleeperLeaguesList
                                    leagues={yahooLeagues}
                                    playerTier={playerSubTier}
                                    commSubs={commSubs.map(s => ({ leagueName: s.leagueName, tier: s.tier }))}
                                    platform="yahoo"
                                    hasPlayerPlan={!!playerSub}
                                    limitReachedIds={limitReachedIds}
                                />
                            </div>

                            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                                    <div>
                                        <h2 className="font-semibold text-lg">NFL Fantasy Leagues</h2>
                                        <p className="text-gray-500 text-sm">{nflLeagues.length} league{nflLeagues.length !== 1 ? 's' : ''} · syncs hourly</p>
                                    </div>
                                    <Link href="/dashboard/sync/nfl"
                                        className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-4 py-2 rounded-lg transition">
                                        + Sync League
                                    </Link>
                                </div>
                                <SleeperLeaguesList
                                    leagues={nflLeagues}
                                    playerTier={playerSubTier}
                                    commSubs={commSubs.map(s => ({ leagueName: s.leagueName, tier: s.tier }))}
                                    platform="nfl"
                                    hasPlayerPlan={!!playerSub}
                                    limitReachedIds={limitReachedIds}
                                />
                            </div>
                        </>
                    );
                })()}

                {/* ── Quick actions ─────────────────────────────────────── */}
                <div>
                    <h2 className="font-semibold text-lg mb-4">Quick Actions</h2>
                    <div className="grid sm:grid-cols-3 gap-3">
                        <Link href="/dashboard/trade"
                            className="block bg-gray-900 border border-gray-800 hover:border-[#D4AF37]/50 rounded-xl p-5 transition group">
                            <div className="text-2xl mb-2">📊</div>
                            <p className="font-semibold text-white group-hover:text-[#D4AF37] transition">Trade Values</p>
                            <p className="text-gray-500 text-sm mt-0.5">Dynamic trade evaluator</p>
                        </Link>
                        <Link href="/dashboard/sync"
                            className="block bg-gray-900 border border-gray-800 hover:border-[#D4AF37]/50 rounded-xl p-5 transition group">
                            <div className="text-2xl mb-2">🔗</div>
                            <p className="font-semibold text-white group-hover:text-[#D4AF37] transition">Sync League</p>
                            <p className="text-gray-500 text-sm mt-0.5">Connect your Sleeper account</p>
                        </Link>
                        <Link href="/pricing"
                            className="block bg-gray-900 border border-gray-800 hover:border-[#D4AF37]/50 rounded-xl p-5 transition group">
                            <div className="text-2xl mb-2">💳</div>
                            <p className="font-semibold text-white group-hover:text-[#D4AF37] transition">Manage Subscription</p>
                            <p className="text-gray-500 text-sm mt-0.5">
                                {!hasAnyActiveSub ? 'View plans and pricing' : isElite ? 'Billing and plan details' : 'Plans, billing, and upgrades'}
                            </p>
                        </Link>
                        <Link href="/dashboard/billing"
                            className="block bg-gray-900 border border-gray-800 hover:border-[#D4AF37]/50 rounded-xl p-5 transition group">
                            <div className="text-2xl mb-2">🧾</div>
                            <p className="font-semibold text-white group-hover:text-[#D4AF37] transition">Billing History</p>
                            <p className="text-gray-500 text-sm mt-0.5">Receipts and past invoices</p>
                        </Link>
                        <Link href="/dss/leaderboard"
                            className="block bg-gray-900 border border-gray-800 hover:border-[#D4AF37]/50 rounded-xl p-5 transition group">
                            <div className="text-2xl mb-2">🏆</div>
                            <p className="font-semibold text-white group-hover:text-[#D4AF37] transition">DSS Leaderboard</p>
                            <p className="text-gray-500 text-sm mt-0.5">Top dynasty players ranked by skill</p>
                        </Link>
                    </div>
                </div>

            </div>
        </main>
    );
}
