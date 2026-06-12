// FantasyiQ Trust — Commissioner Activation Engine (Phase 3, Engine 2)

import { prisma } from '@/lib/prisma';

// ── Stage definitions ─────────────────────────────────────────────────────────

export type ActivationStage =
    | 'registered'
    | 'platform_connected'
    | 'league_synced'
    | 'lf_profile'
    | 'dues_added'
    | 'members_vouched'
    | 'tools_active'
    | 'renewed';

export const STAGE_ORDER: ActivationStage[] = [
    'registered',
    'platform_connected',
    'league_synced',
    'lf_profile',
    'dues_added',
    'members_vouched',
    'tools_active',
    'renewed',
];

export const STAGE_LABELS: Record<ActivationStage, string> = {
    registered:         'Registered',
    platform_connected: 'Connected Platform',
    league_synced:      'Synced League',
    lf_profile:         'Created LF Profile',
    dues_added:         'Added Dues',
    members_vouched:    'Vouched Members',
    tools_active:       'Commissioner Tools Active',
    renewed:            'Subscription Renewed',
};

export const NEXT_STEP: Record<ActivationStage, { title: string; cta: string; href: string } | null> = {
    registered:         { title: 'Connect your Sleeper, ESPN, or Yahoo account to get started.', cta: 'Connect Platform', href: '/dashboard' },
    platform_connected: { title: 'Sync a league to unlock your Commissioner Hub.', cta: 'Go to Dashboard', href: '/dashboard' },
    league_synced:      { title: 'Create your LeagueFinder profile to recruit managers.', cta: 'Create Profile', href: '/leaguefinder/commissioners/new' },
    lf_profile:         { title: 'Set up league dues tracking to manage your league money.', cta: 'Set Up Dues', href: '/dashboard/commissioner/dues' },
    dues_added:         { title: 'Vouch for your trusted members to build their PRS reputation.', cta: 'Go to League', href: '/dashboard' },
    members_vouched:    { title: 'Activate your Commissioner plan to unlock all tools.', cta: 'View Plans', href: '/pricing' },
    tools_active:       null,
    renewed:            null,
};

// ── Stage computation ─────────────────────────────────────────────────────────

export async function computeActivationStage(userId: string): Promise<{
    stage:           ActivationStage;
    completedStages: ActivationStage[];
    nextStep:        { title: string; cta: string; href: string } | null;
}> {
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: {
            sleeperUserId:    true,
            espnS2:           true,
            yahooAccessToken: true,
            leagues:          { select: { id: true }, take: 1 },
            ownedCommissioner:{ select: { id: true, createdAt: true } },
            commissionerDues: { select: { id: true }, take: 1 },
            vouchesGiven:     { select: { id: true }, take: 1 },
            subscriptions: {
                where:   { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                select:  { id: true, createdAt: true, currentPeriodStart: true },
                orderBy: { createdAt: 'asc' },
                take:    1,
            },
        },
    });

    if (!user) return { stage: 'registered', completedStages: ['registered'], nextStep: NEXT_STEP.registered };

    const activeSub     = user.subscriptions[0] ?? null;
    const toolsActive   = !!activeSub;
    const THIRTY_FIVE_DAYS = 35 * 24 * 60 * 60 * 1000;
    const renewed       = toolsActive && activeSub.currentPeriodStart
        ? activeSub.currentPeriodStart.getTime() > activeSub.createdAt.getTime() + THIRTY_FIVE_DAYS
        : false;

    const flags: boolean[] = [
        true,                                                                               // registered
        !!(user.sleeperUserId || user.espnS2 || user.yahooAccessToken),                    // platform_connected
        user.leagues.length > 0,                                                            // league_synced
        !!user.ownedCommissioner,                                                           // lf_profile
        user.commissionerDues.length > 0,                                                   // dues_added
        user.vouchesGiven.length > 0,                                                       // members_vouched
        toolsActive,                                                                        // tools_active
        renewed,                                                                            // renewed
    ];

    const completedStages = STAGE_ORDER.filter((_, i) => flags[i]);
    const lastIdx         = flags.lastIndexOf(true);
    const stage           = STAGE_ORDER[lastIdx] ?? 'registered';

    // Next step = first gap in the funnel (not just the step after the last completed one).
    // This correctly surfaces skipped steps — e.g. a user who used ELITE100 and jumped to
    // tools_active without doing dues or vouch will see those steps, not null.
    const firstIncompleteIdx = flags.indexOf(false);
    const nextStage          = firstIncompleteIdx >= 0 ? STAGE_ORDER[firstIncompleteIdx] : undefined;
    const nextStep           = nextStage ? (NEXT_STEP[nextStage] ?? null) : null;

    return { stage, completedStages, nextStep };
}

// ── Admin funnel summary ──────────────────────────────────────────────────────

export async function getActivationFunnel() {
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

    const [
        totalUsers,
        hasPlatform,
        hasLeague,
        hasLfProfile,
        hasDues,
        hasCommSub,
        hasRenewed,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
            where: {
                OR: [
                    { sleeperUserId: { not: null } },
                    { espnS2: { not: null } },
                    { yahooAccessToken: { not: null } },
                ],
            },
        }),
        prisma.user.count({ where: { leagues: { some: {} } } }),
        prisma.user.count({ where: { ownedCommissioner: { isNot: null } } }),
        prisma.user.count({ where: { commissionerDues: { some: {} } } }),
        // Count distinct users with active commissioner sub
        prisma.subscription.groupBy({
            by:    ['userId'],
            where: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
        }).then(r => r.length),
        // Renewed = commissioner sub created 35+ days ago and still active
        prisma.subscription.groupBy({
            by:    ['userId'],
            where: {
                type:      'commissioner',
                status:    { in: ['active', 'trialing'] },
                createdAt: { lt: thirtyFiveDaysAgo },
            },
        }).then(r => r.length),
    ]);

    return [
        { stage: 'registered'         as ActivationStage, count: totalUsers      },
        { stage: 'platform_connected' as ActivationStage, count: hasPlatform     },
        { stage: 'league_synced'      as ActivationStage, count: hasLeague        },
        { stage: 'lf_profile'         as ActivationStage, count: hasLfProfile     },
        { stage: 'dues_added'         as ActivationStage, count: hasDues          },
        { stage: 'tools_active'       as ActivationStage, count: hasCommSub       },
        { stage: 'renewed'            as ActivationStage, count: hasRenewed       },
    ];
}

// ── Nudge helpers (used by cron) ──────────────────────────────────────────────

const NUDGE_COOLDOWN_MS    = 7  * 24 * 60 * 60 * 1000; // 7 days between nudges
const MIN_DAYS_AT_STAGE: Partial<Record<ActivationStage, number>> = {
    registered:         2,
    platform_connected: 3,
    league_synced:      3,
    lf_profile:         7,
    dues_added:         14,
    members_vouched:    7,
};

const NUDGE_MSGS: Partial<Record<ActivationStage, { title: string; body: string }>> = {
    registered: {
        title: 'Complete your FiQ setup',
        body:  'Connect your fantasy platform (Sleeper, ESPN, or Yahoo) to sync your league and unlock commissioner tools.',
    },
    platform_connected: {
        title: 'Sync a league to get started',
        body:  "You've connected your platform — now sync a league to unlock your Commissioner Hub and start managing your season.",
    },
    league_synced: {
        title: 'Your league is ready — create your LeagueFinder profile',
        body:  "Your league is synced! Create a LeagueFinder profile to help managers find and join your league.",
    },
    lf_profile: {
        title: 'Set up league dues tracking',
        body:  "Your LeagueFinder profile is live. Add a dues tracker to manage your league's buy-ins and payouts automatically.",
    },
    dues_added: {
        title: 'Activate your Commissioner plan',
        body:  "You're managing dues — upgrade to a Commissioner plan to unlock announcements, calendar, and advanced league tools.",
    },
    members_vouched: {
        title: 'Vouch for your trusted members',
        body:  "You're all set up — now vouch for managers you trust to strengthen their PRS reputation. Go to any league overview and click the vouch button next to a member.",
    },
};

export async function nudgeStuckCommissioners(): Promise<{ nudged: number; skipped: number }> {
    const now            = Date.now();
    const cooldownCutoff = new Date(now - NUDGE_COOLDOWN_MS);

    // Collect ALL user IDs that received any commissioner_nudge in the cooldown window
    // up front — this prevents double-nudging within a single run AND across concurrent runs.
    const allCandidateIds = new Set<string>();
    for (const stage of Object.keys(MIN_DAYS_AT_STAGE) as ActivationStage[]) {
        const minDays    = MIN_DAYS_AT_STAGE[stage]!;
        const cutoffDate = new Date(now - minDays * 24 * 60 * 60 * 1000);
        const stageWhere = stageFilter(stage, cutoffDate);
        if (!stageWhere) continue;
        const candidates = await prisma.user.findMany({ where: stageWhere, take: 500, select: { id: true } });
        candidates.forEach(u => allCandidateIds.add(u.id));
    }

    if (allCandidateIds.size === 0) return { nudged: 0, skipped: 0 };

    const recentlyNudged = await prisma.notification.findMany({
        where: {
            userId:    { in: [...allCandidateIds] },
            type:      'commissioner_nudge',
            createdAt: { gte: cooldownCutoff },
        },
        select: { userId: true },
    });
    // Global set of users already nudged — shared across all stage iterations
    const nudgedSet = new Set(recentlyNudged.map(n => n.userId));

    let nudged = 0, skipped = nudgedSet.size;

    for (const stage of Object.keys(MIN_DAYS_AT_STAGE) as ActivationStage[]) {
        const minDays    = MIN_DAYS_AT_STAGE[stage]!;
        const cutoffDate = new Date(now - minDays * 24 * 60 * 60 * 1000);
        const msg        = NUDGE_MSGS[stage]!;

        const stageWhere = stageFilter(stage, cutoffDate);
        if (!stageWhere) continue;

        const candidates = await prisma.user.findMany({
            where:  stageWhere,
            take:   500,
            select: { id: true },
        });

        if (candidates.length === 0) continue;

        const toNudge = candidates.map(u => u.id).filter(id => !nudgedSet.has(id));
        if (toNudge.length === 0) continue;

        await prisma.notification.createMany({
            data: toNudge.map(userId => ({
                userId,
                type:  'commissioner_nudge',
                title: msg.title,
                body:  msg.body,
                data:  { stage },
            })),
        });

        // Mark as nudged so subsequent stage iterations skip them
        toNudge.forEach(id => nudgedSet.add(id));
        nudged += toNudge.length;
    }

    return { nudged, skipped };
}

// Prisma where-clause for each "exactly at this stage" (has this stage, lacks the next)
function stageFilter(stage: ActivationStage, registeredBefore: Date) {
    const platformClause = {
        OR: [
            { sleeperUserId:    { not: null } },
            { espnS2:           { not: null } },
            { yahooAccessToken: { not: null } },
        ],
    };

    switch (stage) {
        case 'registered':
            return {
                createdAt: { lt: registeredBefore },
                sleeperUserId:    null,
                espnS2:           null,
                yahooAccessToken: null,
            };
        case 'platform_connected':
            return {
                createdAt: { lt: registeredBefore },
                ...platformClause,
                leagues: { none: {} },
            };
        case 'league_synced':
            return {
                createdAt: { lt: registeredBefore },
                leagues:          { some: {} },
                ownedCommissioner: null,
            };
        case 'lf_profile':
            return {
                createdAt: { lt: registeredBefore },
                ownedCommissioner: { isNot: null },
                commissionerDues:  { none: {} },
            };
        case 'dues_added':
            return {
                createdAt:        { lt: registeredBefore },
                commissionerDues: { some: {} },
                vouchesGiven:     { none: {} },
                subscriptions: {
                    none: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                },
            };
        case 'members_vouched':
            return {
                createdAt:    { lt: registeredBefore },
                vouchesGiven: { none: {} },
                subscriptions: {
                    some: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                },
            };
        default:
            return null;
    }
}
