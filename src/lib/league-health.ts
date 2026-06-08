// FantasyiQ Trust — League Health Engine (Phase 3, Engine 5)

import { prisma } from '@/lib/prisma';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealthTier = 'healthy' | 'fair' | 'unhealthy' | 'unknown';

export interface HealthSignals {
    syncScore:  number;  // 0-35
    dataScore:  number;  // 0-25
    draftScore: number;  // 0-20
    commScore:  number;  // 0-20
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Scoring ───────────────────────────────────────────────────────────────────

export function computeLeagueHealth(data: {
    lastSyncedAt:     Date | null;
    hasStandings:     boolean;
    totalRosters:     number;
    draftStatus:      string | null;
    draftStartTime:   bigint | null;
    status:           string;
    announcementCount:number;
    calendarCount:    number;
    duesCount:        number;
}, now = Date.now()): { score: number; tier: HealthTier; signals: HealthSignals } {
    // 1. Sync recency (0-35)
    let syncScore = 0;
    if (data.lastSyncedAt) {
        const days = (now - data.lastSyncedAt.getTime()) / DAY_MS;
        if      (days <= 1)  syncScore = 35;
        else if (days <= 3)  syncScore = 25;
        else if (days <= 7)  syncScore = 15;
        else if (days <= 14) syncScore = 5;
    }

    // 2. Data completeness (0-25)
    let dataScore = 0;
    if (data.hasStandings)   dataScore += 15;
    if (data.totalRosters > 0) dataScore += 10;

    // 3. Draft readiness (0-20)
    let draftScore = 0;
    if      (data.draftStatus === 'complete') draftScore = 20;
    else if (data.draftStatus === 'drafting') draftScore = 10;
    else if (data.draftStartTime)             draftScore = 8;
    else if (data.status === 'pre_draft')     draftScore = 5;
    else if (data.status === 'complete')      draftScore = 20; // season finished = draft was done

    // 4. Commissioner activity (0-20)
    let commScore = 0;
    if (data.announcementCount > 0) commScore += 7;
    if (data.calendarCount     > 0) commScore += 7;
    if (data.duesCount         > 0) commScore += 6;

    const score = syncScore + dataScore + draftScore + commScore;
    const tier  = score >= 75 ? 'healthy' : score >= 45 ? 'fair' : 'unhealthy';

    return { score, tier, signals: { syncScore, dataScore, draftScore, commScore } };
}

// ── Nudge messages ────────────────────────────────────────────────────────────

function pickNudgeMessage(signals: HealthSignals, leagueName: string): { title: string; body: string } | null {
    if (signals.syncScore === 0) {
        return {
            title: `"${leagueName}" hasn't synced recently`,
            body:  "Your league data is over 2 weeks old. Head to your dashboard and hit Refresh to bring it current.",
        };
    }
    if (signals.draftScore === 0) {
        return {
            title: `Draft data missing for "${leagueName}"`,
            body:  "Your draft hasn't been captured yet. Sync your league after the draft completes to lock in draft grades and rookie scores.",
        };
    }
    if (signals.commScore === 0) {
        return {
            title: `"${leagueName}" needs commissioner attention`,
            body:  "Your league has no announcements, calendar, or dues set up. Use Commissioner Hub to keep your managers engaged.",
        };
    }
    if (signals.dataScore < 15) {
        return {
            title: `Missing roster data for "${leagueName}"`,
            body:  "Your league is missing standings data. Sync the league to pull in the latest rosters and team records.",
        };
    }
    return null;
}

// ── Cron runner ───────────────────────────────────────────────────────────────

export async function runLeagueHealthCheck(): Promise<{
    checked:   number;
    healthy:   number;
    fair:      number;
    unhealthy: number;
    nudged:    number;
}> {
    const now            = Date.now();
    const cooldownCutoff = new Date(now - 7 * DAY_MS);

    // Fetch all leagues with health-relevant relations
    const leagues = await prisma.league.findMany({
        take: 1000,
        select: {
            id:           true,
            userId:       true,
            leagueName:   true,
            status:       true,
            totalRosters: true,
            lastSyncedAt: true,
            standings:    true,
            draftStatus:  true,
            draftStartTime:true,
            healthTier:   true,
            _count: {
                select: {
                    announcements:  true,
                    calendarEvents: true,
                },
            },
            // Commissioner's dues for this league's userId
            user: {
                select: {
                    commissionerDues: { select: { id: true }, take: 1 },
                },
            },
        },
    });

    if (leagues.length === 0) return { checked: 0, healthy: 0, fair: 0, unhealthy: 0, nudged: 0 };

    // Score all leagues
    type Scored = {
        id:         string;
        userId:     string;
        leagueName: string;
        score:      number;
        tier:       HealthTier;
        signals:    HealthSignals;
        prevTier:   string;
    };
    const scored: Scored[] = leagues.map(l => {
        const { score, tier, signals } = computeLeagueHealth({
            lastSyncedAt:      l.lastSyncedAt,
            hasStandings:      l.standings !== null,
            totalRosters:      l.totalRosters,
            draftStatus:       l.draftStatus,
            draftStartTime:    l.draftStartTime,
            status:            l.status,
            announcementCount: l._count.announcements,
            calendarCount:     l._count.calendarEvents,
            duesCount:         l.user.commissionerDues.length,
        }, now);
        return { id: l.id, userId: l.userId, leagueName: l.leagueName, score, tier, signals, prevTier: l.healthTier };
    });

    // Bulk update all League health fields
    await Promise.all(
        scored.map(l =>
            prisma.league.update({
                where: { id: l.id },
                data:  {
                    healthScore:     l.score,
                    healthTier:      l.tier,
                    healthSignals:   l.signals as unknown as Record<string, number>,
                    healthCheckedAt: new Date(),
                },
            })
        )
    );

    // Identify leagues that are unhealthy and newly degraded (or unknown → unhealthy)
    const toNudge = scored.filter(
        l => l.tier === 'unhealthy' && (l.prevTier === 'healthy' || l.prevTier === 'fair' || l.prevTier === 'unknown')
    );

    let nudged = 0;
    if (toNudge.length > 0) {
        // Deduplicate by leagueId — prevents double-nudging the same league
        // across concurrent cron runs or multiple unhealthy leagues per user.
        const userIds      = [...new Set(toNudge.map(l => l.userId))];
        const recentNudges = await prisma.notification.findMany({
            where: {
                userId:    { in: userIds },
                type:      'league_health',
                createdAt: { gte: cooldownCutoff },
            },
            select: { data: true },
        });
        const nudgedLeagueIds = new Set(
            recentNudges
                .map(n => (n.data as Record<string, unknown>)?.leagueId as string | undefined)
                .filter((id): id is string => !!id)
        );

        const notifications = toNudge
            .filter(l => !nudgedLeagueIds.has(l.id))
            .map(l => {
                const msg = pickNudgeMessage(l.signals, l.leagueName);
                if (!msg) return null;
                return {
                    userId: l.userId,
                    type:   'league_health',
                    title:  msg.title,
                    body:   msg.body,
                    data:   { leagueId: l.id, tier: l.tier, signals: l.signals as unknown as Record<string, number> },
                };
            })
            .filter((n): n is NonNullable<typeof n> => n !== null);

        if (notifications.length > 0) {
            await prisma.notification.createMany({ data: notifications });
            nudged = notifications.length;
        }
    }

    const counts = { healthy: 0, fair: 0, unhealthy: 0 };
    for (const l of scored) {
        if (l.tier === 'healthy')   counts.healthy++;
        else if (l.tier === 'fair') counts.fair++;
        else                        counts.unhealthy++;
    }

    return { checked: scored.length, nudged, ...counts };
}

// ── Admin summary ─────────────────────────────────────────────────────────────

export async function getLeagueHealthSummary() {
    const [byTier, byPlatform, worstLeagues, recentNudges] = await Promise.all([
        prisma.league.groupBy({
            by:    ['healthTier'],
            _count: { _all: true },
        }),
        prisma.league.groupBy({
            by:    ['platform', 'healthTier'],
            _count: { _all: true },
        }),
        prisma.league.findMany({
            where:   { healthTier: 'unhealthy' },
            orderBy: { healthScore: 'asc' },
            take:    20,
            select:  {
                id: true, leagueName: true, platform: true, status: true,
                healthScore: true, healthTier: true, healthSignals: true,
                lastSyncedAt: true, healthCheckedAt: true,
                user: { select: { email: true } },
            },
        }),
        prisma.notification.count({
            where: { type: 'league_health', createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) } },
        }),
    ]);

    const tierMap: Record<string, number> = {};
    for (const row of byTier) tierMap[row.healthTier] = row._count._all;

    return { tierMap, byPlatform, worstLeagues, recentNudges };
}
