// FantasyiQ Trust — Predictive Modeling Layer (Phase 3, Engine 7)
//
// Uses calibrated logistic-regression-style models.
// No external ML library — weights are manually tuned from domain knowledge.
// Model version: v1

import { prisma } from '@/lib/prisma';

export const MODEL_VERSION = 'v1';

// ── Math helpers ──────────────────────────────────────────────────────────────

/** Standard sigmoid / logistic function: maps any real → (0, 1). */
function sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
}

/** Clamp to [0, 1] and round to 4 decimal places. */
function prob(z: number): number {
    return Math.round(sigmoid(z) * 10000) / 10000;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Model 1: Churn Probability ────────────────────────────────────────────────
// Predicts: probability a user will stop using FiQ in the next 30 days.
// Calibrated so a healthy active user ≈ 5-15%, high-risk user ≈ 70-90%.

interface ChurnInputs {
    daysSinceLastSync:    number | null;  // null = never synced
    daysSinceLastFeature: number | null;  // null = never used features
    hasActiveSub:         boolean;
    cancelAtPeriodEnd:    boolean;
    unresolvedSyncErrors: number;
    accountAgeDays:       number;
}

export function predictChurn(inp: ChurnInputs): number {
    let z = -1.8;  // bias → ~14% base rate

    // No sync history (never engaged)
    if (inp.daysSinceLastSync === null) {
        z += 1.2;
    } else {
        if      (inp.daysSinceLastSync > 21) z += 2.0;
        else if (inp.daysSinceLastSync > 14) z += 1.2;
        else if (inp.daysSinceLastSync > 7)  z += 0.4;
        else                                  z -= 0.3; // recently active
    }

    // Feature disengagement
    if (inp.daysSinceLastFeature !== null) {
        if      (inp.daysSinceLastFeature > 14) z += 1.0;
        else if (inp.daysSinceLastFeature > 7)  z += 0.4;
        else                                     z -= 0.4;
    }

    // Active subscription anchors users
    if (inp.hasActiveSub) z -= 1.0;

    // Cancellation is the strongest signal
    if (inp.cancelAtPeriodEnd) z += 2.5;

    // Sync errors frustrate users
    if (inp.unresolvedSyncErrors >= 3) z += 0.7;
    else if (inp.unresolvedSyncErrors >= 1) z += 0.3;

    // New users are naturally higher risk until habit forms
    if (inp.accountAgeDays < 7)  z += 0.5;
    else if (inp.accountAgeDays > 90) z -= 0.3; // retained users are stickier

    return prob(z);
}

// ── Model 2: Commissioner Conversion Probability ──────────────────────────────
// Predicts: probability a FREE/Player user converts to a commissioner plan.
// Calibrated so someone with a full LF profile + dues ≈ 75%+.

interface ConversionInputs {
    currentTier:          string;   // 'FREE' | 'PLAYER_*' | 'COMMISSIONER_*'
    hasLfProfile:         boolean;
    hasDues:              boolean;
    isDuesMember:         boolean;
    hasCalendarOrAnnounce:boolean;
    leagueCount:          number;
    featureEventsThisMonth:number;
    accountAgeDays:       number;
}

export function predictConversion(inp: ConversionInputs): number {
    // Already a commissioner — not relevant
    if (inp.currentTier.startsWith('COMMISSIONER')) return 0;

    let z = -2.5; // bias → ~7% base rate

    if (inp.hasLfProfile)          z += 1.8;  // strongest signal: they care about their commissioner brand
    if (inp.hasDues)               z += 1.5;  // already managing money
    if (inp.isDuesMember)          z += 0.7;  // sees value from a member's perspective
    if (inp.hasCalendarOrAnnounce) z += 0.9;
    if (inp.leagueCount >= 2)      z += 0.6;
    if (inp.leagueCount >= 1)      z += 0.4;

    // Engagement signals
    if      (inp.featureEventsThisMonth >= 10) z += 0.8;
    else if (inp.featureEventsThisMonth >= 5)  z += 0.4;

    if (inp.currentTier !== 'FREE') z += 0.5; // paying users more likely to buy more

    // Sweet spot for conversion: 30-180 days
    if (inp.accountAgeDays >= 30 && inp.accountAgeDays <= 180) z += 0.3;

    return prob(z);
}

// ── Model 3: Subscription Upgrade Probability ────────────────────────────────
// Predicts: probability a user upgrades their current plan tier within 30 days.

interface UpgradeInputs {
    currentTier:           string;
    featureEventsThisMonth:number;
    leagueCount:           number;
    hasMultipleCommSubs:   boolean;
    accountAgeDays:        number;
}

export function predictUpgrade(inp: UpgradeInputs): number {
    // Already on top tiers — unlikely to upgrade further
    if (inp.currentTier === 'COMMISSIONER_ELITE' || inp.currentTier === 'PLAYER_ELITE') return prob(-3.5);

    let z = -2.8;

    // Feature usage intensity
    if      (inp.featureEventsThisMonth >= 15) z += 1.5;
    else if (inp.featureEventsThisMonth >= 8)  z += 0.9;
    else if (inp.featureEventsThisMonth >= 3)  z += 0.4;

    // Multi-league users want better tooling
    if (inp.leagueCount >= 3) z += 1.2;
    else if (inp.leagueCount >= 2) z += 0.6;

    // Already paying → knows the value
    if (inp.currentTier !== 'FREE') z += 0.7;

    // Commissioner running multiple leagues wants consolidated plan
    if (inp.hasMultipleCommSubs) z += 1.0;

    // Sweet spot: 30-365 days
    if (inp.accountAgeDays >= 30 && inp.accountAgeDays <= 365) z += 0.2;

    return prob(z);
}

// ── Model 4: League Survival Probability ─────────────────────────────────────
// Predicts: probability a league is still active next season.

interface SurvivalInputs {
    healthScore:       number;  // 0-100 from Engine 5
    status:            string;
    hasDues:           boolean;
    hasLfProfile:      boolean; // owner has LF profile = invested commissioner
    completedSeasons:  number;  // from LFLeague if available
    daysSinceSync:     number | null;
}

export function predictSurvival(inp: SurvivalInputs): number {
    let z = -0.2; // ~45% base rate

    // Health score is the strongest predictor
    z += (inp.healthScore - 50) * 0.04; // +2.0 at 100, -2.0 at 0

    // Active season
    if (inp.status === 'in_season')   z += 0.8;
    else if (inp.status === 'complete') z += 0.4; // finished = likely to return
    else if (inp.status === 'pre_draft') z += 0.2;

    // Commissioner investment
    if (inp.hasDues)       z += 0.7;  // financial stake = strong retention
    if (inp.hasLfProfile)  z += 0.5;

    // Recent sync = active engagement
    if (inp.daysSinceSync !== null) {
        if      (inp.daysSinceSync <= 3)  z += 0.6;
        else if (inp.daysSinceSync <= 7)  z += 0.3;
        else if (inp.daysSinceSync > 30)  z -= 0.8;
    } else {
        z -= 1.0; // never synced = dormant
    }

    // Established leagues survive
    if (inp.completedSeasons >= 5)      z += 0.8;
    else if (inp.completedSeasons >= 3) z += 0.4;
    else if (inp.completedSeasons >= 1) z += 0.2;

    return prob(z);
}

// ── Cron runner ───────────────────────────────────────────────────────────────

export async function runPredictiveModels(): Promise<{
    usersScored:  number;
    leaguesScored:number;
}> {
    const now           = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * DAY_MS);

    // ── User predictions ──────────────────────────────────────────────────────
    const users = await prisma.user.findMany({
        select: {
            id: true,
            createdAt: true,
            subscriptionTier: true,
            leagues: {
                select: {
                    id: true, lastSyncedAt: true,
                    _count: { select: { calendarEvents: true, announcements: true } },
                },
                orderBy: { lastSyncedAt: 'desc' },
                take:    1,
            },
            featureEvents: {
                where:  { createdAt: { gte: thirtyDaysAgo } },
                select: { id: true },
            },
            _count: { select: { featureEvents: true } },
            subscriptions: {
                where:  { status: { in: ['active', 'trialing'] } },
                select: { type: true, cancelAtPeriodEnd: true },
            },
            syncRecoveryEvents: {
                where:  { resolved: false },
                select: { id: true },
            },
            ownedCommissioner:{ select: { id: true } },
            commissionerDues: { select: { id: true }, take: 1 },
            duesMemberships:  { select: { id: true }, take: 1 },
        },
    });

    const userUpserts = users.map(u => {
        const lastSync     = u.leagues[0]?.lastSyncedAt ?? null;
        const lastFeature  = null; // we don't store this on user — use featureEvents presence
        const accountDays  = (now - u.createdAt.getTime()) / DAY_MS;
        const commSubs     = u.subscriptions.filter(s => s.type === 'commissioner');
        const cancelSignal = u.subscriptions.some(s => s.cancelAtPeriodEnd);
        const hasActiveSub = u.subscriptions.length > 0;

        const churnP = predictChurn({
            daysSinceLastSync:    lastSync ? (now - lastSync.getTime()) / DAY_MS : null,
            daysSinceLastFeature: u._count.featureEvents > 0 && u.featureEvents.length === 0
                ? 30  // had events before but none this month
                : null,
            hasActiveSub,
            cancelAtPeriodEnd:    cancelSignal,
            unresolvedSyncErrors: u.syncRecoveryEvents.length,
            accountAgeDays:       accountDays,
        });

        const calendarOrAnnounce = u.leagues.some(
            l => l._count.calendarEvents > 0 || l._count.announcements > 0
        );

        const convP = predictConversion({
            currentTier:           u.subscriptionTier,
            hasLfProfile:          !!u.ownedCommissioner,
            hasDues:               u.commissionerDues.length > 0,
            isDuesMember:          u.duesMemberships.length > 0,
            hasCalendarOrAnnounce: calendarOrAnnounce,
            leagueCount:           u.leagues.length,
            featureEventsThisMonth:u.featureEvents.length,
            accountAgeDays:        accountDays,
        });

        const upgradeP = predictUpgrade({
            currentTier:           u.subscriptionTier,
            featureEventsThisMonth:u.featureEvents.length,
            leagueCount:           u.leagues.length,
            hasMultipleCommSubs:   commSubs.length > 1,
            accountAgeDays:        accountDays,
        });

        return prisma.userPrediction.upsert({
            where:  { userId: u.id },
            create: { userId: u.id, churnProbability: churnP, conversionProbability: convP, upgradeProbability: upgradeP, modelVersion: MODEL_VERSION },
            update: { churnProbability: churnP, conversionProbability: convP, upgradeProbability: upgradeP, modelVersion: MODEL_VERSION, computedAt: new Date() },
        });
    });

    // ── League predictions ────────────────────────────────────────────────────
    const leagues = await prisma.league.findMany({
        select: {
            id:             true,
            status:         true,
            healthScore:    true,
            lastSyncedAt:   true,
            user: {
                select: {
                    commissionerDues: { select: { id: true }, take: 1 },
                    ownedCommissioner: { select: {
                        leagues: { select: { completedSeasons: true }, take: 1 },
                    }},
                },
            },
        },
    });

    const leagueUpserts = leagues.map(l => {
        const survP = predictSurvival({
            healthScore:      l.healthScore,
            status:           l.status,
            hasDues:          l.user.commissionerDues.length > 0,
            hasLfProfile:     !!l.user.ownedCommissioner,
            completedSeasons: l.user.ownedCommissioner?.leagues[0]?.completedSeasons ?? 0,
            daysSinceSync:    l.lastSyncedAt ? (now - l.lastSyncedAt.getTime()) / DAY_MS : null,
        });

        return prisma.league.update({
            where: { id: l.id },
            data:  { survivalProbability: survP },
        });
    });

    // Execute in parallel batches (avoid overloading the connection pool)
    const BATCH = 50;
    for (let i = 0; i < userUpserts.length; i += BATCH) {
        await Promise.all(userUpserts.slice(i, i + BATCH));
    }
    for (let i = 0; i < leagueUpserts.length; i += BATCH) {
        await Promise.all(leagueUpserts.slice(i, i + BATCH));
    }

    return { usersScored: users.length, leaguesScored: leagues.length };
}

// ── Admin summary ─────────────────────────────────────────────────────────────

export async function getPredictionsSummary() {
    const [
        highChurnUsers,
        highConversionUsers,
        churnBuckets,
        convBuckets,
        survivalBuckets,
        totalPredictions,
    ] = await Promise.all([
        prisma.userPrediction.findMany({
            where:   { churnProbability: { gte: 0.5 } },
            orderBy: { churnProbability: 'desc' },
            take:    20,
            select:  { userId: true, churnProbability: true, conversionProbability: true, upgradeProbability: true, computedAt: true, user: { select: { email: true, subscriptionTier: true } } },
        }),
        prisma.userPrediction.findMany({
            where:   { conversionProbability: { gte: 0.4 } },
            orderBy: { conversionProbability: 'desc' },
            take:    20,
            select:  { userId: true, churnProbability: true, conversionProbability: true, upgradeProbability: true, computedAt: true, user: { select: { email: true, subscriptionTier: true } } },
        }),
        // Churn distribution buckets
        Promise.all([
            prisma.userPrediction.count({ where: { churnProbability: { lt: 0.1 } } }),
            prisma.userPrediction.count({ where: { churnProbability: { gte: 0.1, lt: 0.25 } } }),
            prisma.userPrediction.count({ where: { churnProbability: { gte: 0.25, lt: 0.5 } } }),
            prisma.userPrediction.count({ where: { churnProbability: { gte: 0.5, lt: 0.75 } } }),
            prisma.userPrediction.count({ where: { churnProbability: { gte: 0.75 } } }),
        ]),
        // Conversion distribution buckets
        Promise.all([
            prisma.userPrediction.count({ where: { conversionProbability: { lt: 0.1 } } }),
            prisma.userPrediction.count({ where: { conversionProbability: { gte: 0.1, lt: 0.3 } } }),
            prisma.userPrediction.count({ where: { conversionProbability: { gte: 0.3, lt: 0.5 } } }),
            prisma.userPrediction.count({ where: { conversionProbability: { gte: 0.5 } } }),
        ]),
        // League survival buckets
        Promise.all([
            prisma.league.count({ where: { survivalProbability: { lt: 0.3 } } }),
            prisma.league.count({ where: { survivalProbability: { gte: 0.3, lt: 0.6 } } }),
            prisma.league.count({ where: { survivalProbability: { gte: 0.6 } } }),
        ]),
        prisma.userPrediction.count(),
    ]);

    return { highChurnUsers, highConversionUsers, churnBuckets, convBuckets, survivalBuckets, totalPredictions };
}
