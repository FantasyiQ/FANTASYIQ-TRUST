// FantasyiQ Trust — Churn Prevention Engine (Phase 3, Engine 3)

import { prisma } from '@/lib/prisma';

// ── Risk scoring ──────────────────────────────────────────────────────────────

export type RiskTier  = 'low' | 'medium' | 'high';
export type ChurnSignal =
    | 'no_sync_10d'
    | 'no_sync_14d'
    | 'no_features_7d'
    | 'no_features_10d'
    | 'cancel_at_period_end'
    | 'sync_failures'
    | 'stale_dues';

export function scoreToTier(score: number): RiskTier {
    if (score >= 61) return 'high';
    if (score >= 31) return 'medium';
    return 'low';
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface UserRiskData {
    lastSyncedAt:      Date | null;
    lastFeatureAt:     Date | null;
    hasFeatureHistory: boolean;
    cancelAtPeriodEnd: boolean;
    unresolvedSyncFailures: number;
    lastDuesUpdatedAt: Date | null;
}

export function computeChurnScore(data: UserRiskData, now = Date.now()): {
    score:   number;
    tier:    RiskTier;
    signals: ChurnSignal[];
} {
    let score = 0;
    const signals: ChurnSignal[] = [];

    // Stale sync (only score users who have had a sync)
    if (data.lastSyncedAt) {
        const days = (now - data.lastSyncedAt.getTime()) / DAY_MS;
        if (days >= 14)      { score += 45; signals.push('no_sync_14d'); }
        else if (days >= 10) { score += 25; signals.push('no_sync_10d'); }
    }

    // No recent feature usage (only score users with feature history)
    if (data.hasFeatureHistory && data.lastFeatureAt) {
        const days = (now - data.lastFeatureAt.getTime()) / DAY_MS;
        if (days >= 10)      { score += 35; signals.push('no_features_10d'); }
        else if (days >= 7)  { score += 20; signals.push('no_features_7d'); }
    }

    // Active subscription set to cancel
    if (data.cancelAtPeriodEnd) { score += 40; signals.push('cancel_at_period_end'); }

    // Accumulated sync failures
    if (data.unresolvedSyncFailures >= 3) { score += 20; signals.push('sync_failures'); }

    // Stale dues tracker (commissioner-specific)
    if (data.lastDuesUpdatedAt) {
        const days = (now - data.lastDuesUpdatedAt.getTime()) / DAY_MS;
        if (days >= 30) { score += 15; signals.push('stale_dues'); }
    }

    const capped = Math.min(score, 100);
    return { score: capped, tier: scoreToTier(capped), signals };
}

// ── Nudge messages ────────────────────────────────────────────────────────────

const NUDGE_MSGS: Record<ChurnSignal, { title: string; body: string }> = {
    no_sync_14d: {
        title: 'Your league data is out of date',
        body:  "It's been 2+ weeks since your league synced. Refresh now to get current standings, rosters, and power rankings.",
    },
    no_sync_10d: {
        title: 'Your league is getting stale',
        body:  "Your league hasn't synced in 10 days. Head to your dashboard and hit Refresh to update your data.",
    },
    no_features_10d: {
        title: 'Your FiQ tools are waiting',
        body:  "It's been a while since you used FiQ. Your trade evaluator, power rankings, and roster values are ready — jump back in.",
    },
    no_features_7d: {
        title: 'Weekly check-in: your rankings are ready',
        body:  'Your power rankings and player values have been updated. Log in to see where your team stands this week.',
    },
    cancel_at_period_end: {
        title: 'Your subscription is set to expire',
        body:  "Your FiQ plan is scheduled to end at the current billing period. You'll lose access to commissioner tools and analytics. Renew anytime.",
    },
    sync_failures: {
        title: 'Your league sync needs attention',
        body:  "We've had trouble syncing your league recently. Check your platform credentials and try a manual refresh from your dashboard.",
    },
    stale_dues: {
        title: 'Your league dues tracker needs an update',
        body:  "It's been 30+ days since your dues tracker was updated. Log in to record new payments and keep your league finances current.",
    },
};

function pickNudgeSignal(signals: ChurnSignal[]): ChurnSignal | null {
    // Priority order: cancellation > sync failure > stale sync > no features > dues
    const priority: ChurnSignal[] = [
        'cancel_at_period_end',
        'no_sync_14d',
        'sync_failures',
        'no_sync_10d',
        'no_features_10d',
        'stale_dues',
        'no_features_7d',
    ];
    return priority.find(s => signals.includes(s)) ?? null;
}

// ── Main cron runner ──────────────────────────────────────────────────────────

const NUDGE_COOLDOWN_MS  = 3 * 24 * 60 * 60 * 1000;  // 3 days between nudges
const MIN_SCORE_FOR_NUDGE = 40;                         // medium+ only

export async function runChurnDetection(): Promise<{
    assessed: number;
    atRisk:   number;
    nudged:   number;
    resolved: number;
}> {
    const now = Date.now();

    // Fetch all candidates: users with leagues or commissioner subs
    const candidates = await prisma.user.findMany({
        where: {
            OR: [
                { leagues:       { some: {} } },
                { subscriptions: { some: { type: 'commissioner' } } },
            ],
        },
        select: {
            id: true,
            leagues: {
                select:  { lastSyncedAt: true },
                orderBy: { lastSyncedAt: 'desc' },
                take:    1,
            },
            featureEvents: {
                select:  { createdAt: true },
                orderBy: { createdAt: 'desc' },
                take:    1,
            },
            _count: { select: { featureEvents: true } },
            subscriptions: {
                where:  { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                select: { cancelAtPeriodEnd: true },
                take:   1,
            },
            syncRecoveryEvents: {
                where:  { resolved: false },
                select: { id: true },
            },
            commissionerDues: {
                select:  { updatedAt: true },
                orderBy: { updatedAt: 'desc' },
                take:    1,
            },
        },
    });

    let atRisk = 0, nudged = 0, resolved = 0;

    // Bulk-fetch existing open churn events and recent nudges
    const userIds        = candidates.map(u => u.id);
    const openEvents     = await prisma.churnRiskEvent.findMany({
        where:  { userId: { in: userIds }, resolved: false },
        select: { id: true, userId: true, nudgeSent: true, nudgeSentAt: true, riskScore: true },
    });
    const openByUser     = new Map(openEvents.map(e => [e.userId, e]));

    // Recent nudge check (notifications with type 'churn_nudge')
    const cooloffCutoff  = new Date(now - NUDGE_COOLDOWN_MS);
    const recentNudges   = await prisma.notification.findMany({
        where:  { userId: { in: userIds }, type: 'churn_nudge', createdAt: { gte: cooloffCutoff } },
        select: { userId: true },
    });
    const nudgedSet      = new Set(recentNudges.map(n => n.userId));

    const toCreate:  Parameters<typeof prisma.churnRiskEvent.create>[0]['data'][] = [];
    const toResolve: string[] = [];
    const toNudge:   { userId: string; signal: ChurnSignal }[] = [];

    for (const user of candidates) {
        const riskData: UserRiskData = {
            lastSyncedAt:          user.leagues[0]?.lastSyncedAt ?? null,
            lastFeatureAt:         user.featureEvents[0]?.createdAt ?? null,
            hasFeatureHistory:     user._count.featureEvents > 0,
            cancelAtPeriodEnd:     user.subscriptions[0]?.cancelAtPeriodEnd ?? false,
            unresolvedSyncFailures:user.syncRecoveryEvents.length,
            lastDuesUpdatedAt:     user.commissionerDues[0]?.updatedAt ?? null,
        };

        const { score, tier, signals } = computeChurnScore(riskData, now);
        const existingEvent = openByUser.get(user.id);

        if (score === 0 || tier === 'low') {
            // User is healthy — resolve any open event
            if (existingEvent) toResolve.push(existingEvent.id);
            continue;
        }

        atRisk++;

        // Create or skip (don't duplicate same-day events)
        if (!existingEvent) {
            toCreate.push({
                userId:    user.id,
                riskScore: score,
                riskTier:  tier,
                signals,
            });
        }

        // Nudge if high/medium risk and not recently nudged
        if (score >= MIN_SCORE_FOR_NUDGE && !nudgedSet.has(user.id)) {
            const signal = pickNudgeSignal(signals);
            if (signal) toNudge.push({ userId: user.id, signal });
        }
    }

    // Write to DB
    await Promise.all([
        toCreate.length > 0
            ? prisma.churnRiskEvent.createMany({ data: toCreate as never[] })
            : Promise.resolve(),
        toResolve.length > 0
            ? prisma.churnRiskEvent.updateMany({
                where: { id: { in: toResolve } },
                data:  { resolved: true, resolvedAt: new Date() },
              })
            : Promise.resolve(),
        toNudge.length > 0
            ? prisma.notification.createMany({
                data: toNudge.map(({ userId, signal }) => ({
                    userId,
                    type:  'churn_nudge',
                    title: NUDGE_MSGS[signal].title,
                    body:  NUDGE_MSGS[signal].body,
                    data:  { signal },
                })),
              })
            : Promise.resolve(),
    ]);

    nudged   = toNudge.length;
    resolved = toResolve.length;

    return { assessed: candidates.length, atRisk, nudged, resolved };
}

// ── Admin summary ─────────────────────────────────────────────────────────────

export async function getChurnSummary() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [byTier, recentEvents, weeklyTrend, resolvedThisWeek] = await Promise.all([
        prisma.churnRiskEvent.groupBy({
            by:    ['riskTier'],
            where: { resolved: false },
            _count: { _all: true },
        }),
        prisma.churnRiskEvent.findMany({
            where:   { resolved: false },
            orderBy: { createdAt: 'desc' },
            take:    20,
            select:  {
                id: true, userId: true, riskScore: true, riskTier: true,
                signals: true, nudgeSent: true, createdAt: true,
                user: { select: { email: true } },
            },
        }),
        // Daily count over last 7 days
        prisma.churnRiskEvent.groupBy({
            by:    ['createdAt'],
            where: { createdAt: { gte: sevenDaysAgo } },
            _count: { _all: true },
        }),
        prisma.churnRiskEvent.count({
            where: { resolved: true, resolvedAt: { gte: sevenDaysAgo } },
        }),
    ]);

    const tierMap: Record<RiskTier, number> = { low: 0, medium: 0, high: 0 };
    for (const row of byTier) tierMap[row.riskTier as RiskTier] = row._count._all;

    return { tierMap, recentEvents, weeklyTrend, resolvedThisWeek };
}
