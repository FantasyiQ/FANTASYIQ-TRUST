// FantasyiQ Trust — Feature Intelligence Engine (Phase 3, Engine 6)

import { prisma } from '@/lib/prisma';
import type { FeatureName } from '@/app/actions/analytics';

// ── Trend types ───────────────────────────────────────────────────────────────

export type TrendDirection = 'rising' | 'stable' | 'declining' | 'abandoned' | 'new';

export interface FeatureTrend {
    feature:             string;
    thisWeek:            number;
    lastWeek:            number;
    deltaAbs:            number;    // thisWeek - lastWeek
    deltaPct:            number | null; // null if lastWeek === 0
    uniqueUsersThisWeek: number;
    direction:           TrendDirection;
}

function classifyTrend(thisWeek: number, lastWeek: number): TrendDirection {
    if (lastWeek === 0 && thisWeek > 0) return 'new';
    if (thisWeek === 0 && lastWeek > 0) return 'abandoned';
    if (lastWeek === 0)                  return 'stable';
    const pct = ((thisWeek - lastWeek) / lastWeek) * 100;
    if (pct >=  40) return 'rising';
    if (pct <= -30) return 'declining';
    return 'stable';
}

// ── Feature suggestion combos ─────────────────────────────────────────────────
// If a user has used `trigger` recently but not `suggest`, nudge them.

const FEATURE_COMBOS: Array<{
    trigger: FeatureName;
    suggest: FeatureName;
    title:   string;
    body:    string;
}> = [
    {
        trigger: 'league_refresh',
        suggest: 'roster_values',
        title:   "See your roster's trade value",
        body:    "You've been refreshing your league — check Roster Values to see your team's KTC trade value and find moves worth making.",
    },
    {
        trigger: 'trade_evaluator',
        suggest: 'draft_report',
        title:   'Grade your draft capital',
        body:    "You evaluate trades regularly — run a Draft Report to see how your dynasty capital stacks up against the rest of your league.",
    },
    {
        trigger: 'power_rankings',
        suggest: 'trade_evaluator',
        title:   'Turn rankings into moves',
        body:    "Your power rankings are updated — use Trade Evaluator to find the best deals based on where your team ranks right now.",
    },
    {
        trigger: 'roster_values',
        suggest: 'player_rankings',
        title:   'Find your next roster target',
        body:    "Your roster is valued — check Player Rankings to spot undervalued players worth adding or targeting in trades.",
    },
    {
        trigger: 'draft_report',
        suggest: 'trade_evaluator',
        title:   'Put your draft grades to work',
        body:    "You have a draft report — use Trade Evaluator to see if any of your high-grade players could fetch a return you actually want.",
    },
];

const SUGGESTION_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ── Trend analysis ────────────────────────────────────────────────────────────

export async function analyzeFeatureTrends(): Promise<FeatureTrend[]> {
    const now          = Date.now();
    const thisWeekAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const twoWeeksAgo  = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const [thisWeekRows, lastWeekRows, uniqueThisWeek] = await Promise.all([
        prisma.featureUsageEvent.groupBy({
            by:    ['feature'],
            where: { createdAt: { gte: thisWeekAgo } },
            _count: { _all: true },
        }),
        prisma.featureUsageEvent.groupBy({
            by:    ['feature'],
            where: { createdAt: { gte: twoWeeksAgo, lt: thisWeekAgo } },
            _count: { _all: true },
        }),
        prisma.featureUsageEvent.findMany({
            where:    { createdAt: { gte: thisWeekAgo } },
            select:   { feature: true, userId: true },
            distinct: ['feature', 'userId'],
        }),
    ]);

    const thisWeekMap  = new Map(thisWeekRows.map(r => [r.feature, r._count._all]));
    const lastWeekMap  = new Map(lastWeekRows.map(r => [r.feature, r._count._all]));
    const uniqueMap    = new Map<string, number>();
    for (const e of uniqueThisWeek) {
        uniqueMap.set(e.feature, (uniqueMap.get(e.feature) ?? 0) + 1);
    }

    // Union of all features seen in either period
    const allFeatures = new Set([...thisWeekMap.keys(), ...lastWeekMap.keys()]);

    const trends: FeatureTrend[] = [];
    for (const feature of allFeatures) {
        const thisWeek = thisWeekMap.get(feature) ?? 0;
        const lastWeek = lastWeekMap.get(feature) ?? 0;
        const deltaAbs = thisWeek - lastWeek;
        const deltaPct = lastWeek > 0 ? Math.round((deltaAbs / lastWeek) * 100) : null;

        trends.push({
            feature,
            thisWeek,
            lastWeek,
            deltaAbs,
            deltaPct,
            uniqueUsersThisWeek: uniqueMap.get(feature) ?? 0,
            direction: classifyTrend(thisWeek, lastWeek),
        });
    }

    return trends.sort((a, b) => b.thisWeek - a.thisWeek);
}

// ── Weekly cron runner ────────────────────────────────────────────────────────

export async function runFeatureIntelligence(): Promise<{
    trends:    FeatureTrend[];
    nudged:    number;
    analyzed:  number;
}> {
    const now            = Date.now();
    const thirtyDaysAgo  = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const cooldownCutoff = new Date(now - SUGGESTION_COOLDOWN_MS);

    const trends = await analyzeFeatureTrends();

    // Build feature suggestion notifications
    let nudged   = 0;
    let analyzed = 0;

    for (const combo of FEATURE_COMBOS) {
        // Users who used `trigger` in last 30 days
        const triggerUsers = await prisma.featureUsageEvent.findMany({
            where:    { feature: combo.trigger, createdAt: { gte: thirtyDaysAgo } },
            select:   { userId: true },
            distinct: ['userId'],
        });

        if (triggerUsers.length === 0) continue;
        const userIds = triggerUsers.map(u => u.userId);
        analyzed += userIds.length;

        // Exclude users who have used `suggest` recently
        const alreadyUsed = await prisma.featureUsageEvent.findMany({
            where:  { feature: combo.suggest, userId: { in: userIds }, createdAt: { gte: thirtyDaysAgo } },
            select: { userId: true },
            distinct: ['userId'],
        });
        const usedSet = new Set(alreadyUsed.map(u => u.userId));

        // Exclude users already nudged for this suggestion recently
        const recentNudges = await prisma.notification.findMany({
            where: {
                userId:    { in: userIds },
                type:      'feature_suggestion',
                createdAt: { gte: cooldownCutoff },
                data:      { path: ['suggest'], equals: combo.suggest },
            },
            select: { userId: true },
        });
        const nudgedSet = new Set(recentNudges.map(n => n.userId));

        const toNudge = userIds.filter(id => !usedSet.has(id) && !nudgedSet.has(id));
        if (toNudge.length === 0) continue;

        await prisma.notification.createMany({
            data: toNudge.map(userId => ({
                userId,
                type:  'feature_suggestion',
                title: combo.title,
                body:  combo.body,
                data:  { trigger: combo.trigger, suggest: combo.suggest },
            })),
        });
        nudged += toNudge.length;
    }

    return { trends, nudged, analyzed };
}

// ── Admin intelligence summary ────────────────────────────────────────────────

export async function getFeatureIntelligenceSummary() {
    const [trends, recentSuggestions, suggestionStats] = await Promise.all([
        analyzeFeatureTrends(),
        prisma.notification.findMany({
            where:   { type: 'feature_suggestion' },
            orderBy: { createdAt: 'desc' },
            take:    20,
            select:  {
                id: true, title: true, read: true, createdAt: true, data: true,
                user: { select: { email: true } },
            },
        }),
        prisma.notification.groupBy({
            by:    ['read'],
            where: { type: 'feature_suggestion' },
            _count: { _all: true },
        }),
    ]);

    const totalSuggestions = suggestionStats.reduce((s, r) => s + r._count._all, 0);
    const readCount        = suggestionStats.find(r => r.read)?._count._all ?? 0;
    const readRate         = totalSuggestions > 0 ? Math.round((readCount / totalSuggestions) * 100) : 0;

    const rising   = trends.filter(t => t.direction === 'rising');
    const declining= trends.filter(t => t.direction === 'declining');
    const abandoned= trends.filter(t => t.direction === 'abandoned');

    return {
        trends,
        rising,
        declining,
        abandoned,
        recentSuggestions,
        totalSuggestions,
        readRate,
    };
}
