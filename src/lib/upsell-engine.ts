// FantasyiQ Trust — Automated Upsell & Expansion Engine (Phase 3, Engine 4)

import { prisma } from '@/lib/prisma';

// ── Opportunity types ─────────────────────────────────────────────────────────

export type UpsellType =
    | 'free_to_player'           // FREE user with meaningful feature engagement
    | 'player_to_commissioner'   // Player-plan user showing commissioner behaviour
    | 'commissioner_upgrade';    // COMMISSIONER_PRO user with multi-league activity

export const UPSELL_LABELS: Record<UpsellType, string> = {
    free_to_player:        'Free → Player',
    player_to_commissioner:'Player → Commissioner',
    commissioner_upgrade:  'Comm. Upgrade',
};

// ── Nudge copy ────────────────────────────────────────────────────────────────

const NUDGE_MSGS: Record<UpsellType, { title: string; body: string; href: string }> = {
    free_to_player: {
        title: 'Unlock your full FiQ experience',
        body:  "You've been using FiQ regularly. Upgrade to Player Pro to unlock advanced trade analysis, draft grades, and unlimited roster values.",
        href:  '/pricing',
    },
    player_to_commissioner: {
        title: 'You run a league — FiQ has tools for that',
        body:  "Upgrade to a Commissioner plan to manage dues, post announcements, set up your season calendar, and list your league on LeagueFinder.",
        href:  '/pricing',
    },
    commissioner_upgrade: {
        title: 'Manage all your leagues from one place',
        body:  "You're running multiple leagues. Upgrade to Commissioner All-Pro for expanded league management, advanced analytics, and priority support.",
        href:  '/pricing',
    },
};

// ── Scoring helpers ───────────────────────────────────────────────────────────

const DAY_MS              = 24 * 60 * 60 * 1000;
const COOLDOWN_MS         = 7  * DAY_MS;   // max one upsell nudge per type per 7 days
const MIN_SCORE_TO_NUDGE  = 40;

function daysAgo(d: Date | null, now: number): number {
    return d ? (now - d.getTime()) / DAY_MS : Infinity;
}

// ── Cron runner ───────────────────────────────────────────────────────────────

export async function runUpsellEngine(): Promise<{
    assessed:       number;
    opportunities:  number;
    nudged:         number;
}> {
    const now              = Date.now();
    const sevenDaysAgo     = new Date(now - 7  * DAY_MS);
    const cooldownCutoff   = new Date(now - COOLDOWN_MS);

    // ── 1. FREE users with engagement ────────────────────────────────────────
    const freeUsers = await prisma.user.findMany({
        where: {
            subscriptionTier: 'FREE',
            OR: [
                { featureEvents: { some: { createdAt: { gte: sevenDaysAgo } } } },
                { leagues:       { some: {} } },
            ],
        },
        select: {
            id: true,
            leagues:      { select: { id: true } },
            featureEvents:{ where: { createdAt: { gte: sevenDaysAgo } }, select: { id: true } },
        },
    });

    // ── 2. Player-plan users with commissioner behaviour ─────────────────────
    const playerUsers = await prisma.user.findMany({
        where: {
            subscriptionTier: { in: ['PLAYER_PRO', 'PLAYER_ALL_PRO', 'PLAYER_ELITE'] },
            subscriptions: {
                none: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
            },
            OR: [
                { ownedCommissioner: { isNot: null } },
                { commissionerDues:  { some: {} } },
                { duesMemberships:   { some: {} } },
                // Used calendar or announcements
                { leagues: { some: { calendarEvents: { some: {} } } } },
                { leagues: { some: { announcements:  { some: {} } } } },
            ],
        },
        select: {
            id: true,
            ownedCommissioner: { select: { id: true } },
            commissionerDues:  { select: { id: true }, take: 1 },
            duesMemberships:   { select: { id: true }, take: 1 },
            leagues: {
                select: {
                    _count: {
                        select: { calendarEvents: true, announcements: true },
                    },
                },
            },
        },
    });

    // ── 3. COMMISSIONER_PRO users with multi-league activity ─────────────────
    const commProUsers = await prisma.user.findMany({
        where: {
            subscriptions: {
                some: {
                    type:   'commissioner',
                    tier:   'COMMISSIONER_PRO',
                    status: { in: ['active', 'trialing'] },
                },
            },
        },
        select: {
            id: true,
            leagues: { select: { id: true } },
        },
    });

    // ── Collect all candidate user IDs and their types ───────────────────────
    type Candidate = { userId: string; type: UpsellType; score: number };
    const candidates: Candidate[] = [];

    for (const u of freeUsers) {
        let score = 0;
        const eventCount  = u.featureEvents.length;
        const leagueCount = u.leagues.length;
        if (eventCount >= 5) score += 40;
        else if (eventCount >= 3) score += 25;
        if (leagueCount >= 3) score += 30;
        else if (leagueCount >= 2) score += 20;
        else if (leagueCount >= 1) score += 10;
        if (score >= MIN_SCORE_TO_NUDGE) candidates.push({ userId: u.id, type: 'free_to_player', score });
    }

    for (const u of playerUsers) {
        let score = 0;
        if (u.ownedCommissioner)      score += 35;
        if (u.commissionerDues.length) score += 25;
        if (u.duesMemberships.length)  score += 15;
        const calendarActivity  = u.leagues.reduce((s, l) => s + l._count.calendarEvents, 0);
        const announcementCount = u.leagues.reduce((s, l) => s + l._count.announcements,  0);
        if (calendarActivity  > 0) score += 20;
        if (announcementCount > 0) score += 20;
        if (score >= MIN_SCORE_TO_NUDGE) candidates.push({ userId: u.id, type: 'player_to_commissioner', score });
    }

    for (const u of commProUsers) {
        if (u.leagues.length >= 2) {
            candidates.push({ userId: u.id, type: 'commissioner_upgrade', score: 60 });
        }
    }

    if (candidates.length === 0) {
        return { assessed: freeUsers.length + playerUsers.length + commProUsers.length, opportunities: 0, nudged: 0 };
    }

    // ── Deduplicate (one opportunity per user per type) ───────────────────────
    const seen   = new Set<string>();
    const deduped = candidates.filter(c => {
        const key = `${c.userId}:${c.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const userIds = [...new Set(deduped.map(c => c.userId))];

    // ── Cooldown check ────────────────────────────────────────────────────────
    const recentNudges = await prisma.notification.findMany({
        where: {
            userId:    { in: userIds },
            type:      'upsell_prompt',
            createdAt: { gte: cooldownCutoff },
        },
        select: { userId: true, data: true },
    });
    const nudgedKeys = new Set(
        recentNudges.map(n => {
            const d = n.data as Record<string, string> | null;
            return `${n.userId}:${d?.upsellType ?? ''}`;
        })
    );

    const toNudge = deduped.filter(c => !nudgedKeys.has(`${c.userId}:${c.type}`));

    if (toNudge.length === 0) {
        return { assessed: freeUsers.length + playerUsers.length + commProUsers.length, opportunities: deduped.length, nudged: 0 };
    }

    await prisma.notification.createMany({
        data: toNudge.map(c => ({
            userId: c.userId,
            type:   'upsell_prompt',
            title:  NUDGE_MSGS[c.type].title,
            body:   NUDGE_MSGS[c.type].body,
            data:   { upsellType: c.type, score: c.score, href: NUDGE_MSGS[c.type].href },
        })),
    });

    return {
        assessed:      freeUsers.length + playerUsers.length + commProUsers.length,
        opportunities: deduped.length,
        nudged:        toNudge.length,
    };
}

// ── Admin pipeline summary ────────────────────────────────────────────────────

export async function getUpsellSummary() {
    const sevenDaysAgo  = new Date(Date.now() - 7  * DAY_MS);
    const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);

    const [
        recentPrompts,
        promptsLast7d,
        promptsLast30d,
        byType,
        freeEngagedCount,
        playerCommCount,
    ] = await Promise.all([
        // Last 20 upsell notifications sent
        prisma.notification.findMany({
            where:   { type: 'upsell_prompt' },
            orderBy: { createdAt: 'desc' },
            take:    20,
            select:  {
                id: true, createdAt: true, title: true, data: true, read: true,
                user: { select: { email: true, subscriptionTier: true } },
            },
        }),
        prisma.notification.count({ where: { type: 'upsell_prompt', createdAt: { gte: sevenDaysAgo  } } }),
        prisma.notification.count({ where: { type: 'upsell_prompt', createdAt: { gte: thirtyDaysAgo } } }),
        // Count by upsell type via raw signal in data field — approximate via title
        prisma.notification.groupBy({
            by:    ['title'],
            where: { type: 'upsell_prompt' },
            _count: { _all: true },
            orderBy: { _count: { title: 'desc' } },
        }),
        // FREE users with any feature event this week (upsell pipeline size)
        prisma.user.count({
            where: {
                subscriptionTier: 'FREE',
                featureEvents: { some: { createdAt: { gte: sevenDaysAgo } } },
            },
        }),
        // Player users with commissioner behaviour indicators
        prisma.user.count({
            where: {
                subscriptionTier: { in: ['PLAYER_PRO', 'PLAYER_ALL_PRO', 'PLAYER_ELITE'] },
                subscriptions:    { none: { type: 'commissioner', status: { in: ['active', 'trialing'] } } },
                OR: [
                    { ownedCommissioner: { isNot: null } },
                    { commissionerDues:  { some: {} } },
                ],
            },
        }),
    ]);

    return { recentPrompts, promptsLast7d, promptsLast30d, byType, freeEngagedCount, playerCommCount };
}
