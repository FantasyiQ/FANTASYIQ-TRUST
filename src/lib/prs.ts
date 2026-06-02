// Player Reliability Score (PRS) — calculation engine
// Spec: https://fantasyiq-trust/docs/prs

import { prisma } from '@/lib/prisma';
import type { PrsEventType } from '@prisma/client';

// ── Tier ─────────────────────────────────────────────────────────────────────

export type PrsTier = 'Unproven' | 'Developing' | 'Reliable' | 'Trusted' | 'Elite';

export function getPrsTier(prs: number): PrsTier {
    if (prs <= 20) return 'Unproven';
    if (prs <= 40) return 'Developing';
    if (prs <= 60) return 'Reliable';
    if (prs <= 80) return 'Trusted';
    return 'Elite';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, value));
}

// ── Component calculators ─────────────────────────────────────────────────────

function calcSeasonScore(events: { eventType: PrsEventType }[]): number {
    const verifiedCount = events.filter(e => e.eventType === 'verified_season').length;
    const abandonedCount = events.filter(e => e.eventType === 'season_abandoned').length;

    const verifiedBase = [0, 20, 40, 60, 80, 100][Math.min(verifiedCount, 5)];
    const penalty = abandonedCount * 25;
    return clamp(verifiedBase - penalty);
}

function calcRetentionScore(events: { eventType: PrsEventType }[]): number {
    // Per-league normalization: score = (leagues stayed) / (leagues with retention events) * 100.
    // This makes the score scale-independent — a user in 10 leagues who stays in 7 = 70,
    // same as a user in 1 league who stays = 100.
    const stayed  = events.filter(e => e.eventType === 'retention_stayed').length;
    const left    = events.filter(e => e.eventType === 'retention_left').length;
    const removed = events.filter(e => e.eventType === 'retention_removed').length;
    const total   = stayed + left + removed;
    if (total === 0) return 0;
    return clamp(Math.round((stayed / total) * 100));
}

function calcEngagementScore(events: { eventType: PrsEventType }[]): number {
    let raw = 0;
    for (const e of events) {
        if (e.eventType === 'lineup_set')      raw += 2;
        if (e.eventType === 'lineup_missed')   raw -= 5;
        if (e.eventType === 'trade_response')  raw += 1;
        if (e.eventType === 'trade_ignored')   raw -= 2;
        if (e.eventType === 'waiver_active')   raw += 1;
    }
    return clamp(raw);
}

function calcCommissionerTrust(events: { eventType: PrsEventType }[]): number {
    const relevant = events.filter(e =>
        ['commish_approval', 'commish_endorsement', 'commish_flag', 'commish_ban'].includes(e.eventType)
    );
    if (relevant.length === 0) return 50; // neutral default — no commissioner data

    let total = 0;
    for (const e of relevant) {
        if (e.eventType === 'commish_approval')    total += 25;
        if (e.eventType === 'commish_endorsement') total += 40;
        if (e.eventType === 'commish_flag')        total -= 40;
        if (e.eventType === 'commish_ban')         total -= 100;
    }
    // Linear normalization: map avg from [-100, +40] → [0, 100].
    // Worst possible avg = -100 → 0. Best = +40 → 100. Range = 140.
    const avg = total / relevant.length;
    return clamp(Math.round(((avg + 100) / 140) * 100));
}

function calcBehaviorScore(events: { eventType: PrsEventType }[]): number {
    let score = 100;
    for (const e of events) {
        if (e.eventType === 'veto_abuse')      score -= 10;
        if (e.eventType === 'collusion_flag')  score -= 50;
        if (e.eventType === 'tanking_flag')    score -= 25;
        if (e.eventType === 'toxicity_report') score -= 10;
        if (e.eventType === 'rule_violation')  score -= 15;
    }
    return clamp(score);
}

// ── Edge cases ────────────────────────────────────────────────────────────────

function applyEdgeCases(
    prs: number,
    events: { eventType: PrsEventType }[],
    hasNoData: boolean
): number {
    if (hasNoData) return 10; // Unproven

    const banned = events.some(e => e.eventType === 'commish_ban');
    if (banned) return Math.min(prs, 20); // hard cap at 20

    const verifiedCount = events.filter(e => e.eventType === 'verified_season').length;
    const hasPenalties = events.some(e =>
        ['season_abandoned', 'retention_removed',
         'commish_flag', 'commish_ban', 'veto_abuse', 'collusion_flag',
         'tanking_flag', 'toxicity_report', 'rule_violation'].includes(e.eventType)
    );
    if (verifiedCount >= 3 && !hasPenalties) return Math.max(prs, 50);

    return prs;
}

// ── Main calculation ──────────────────────────────────────────────────────────

export interface PrsComponents {
    seasonScore: number;
    retentionScore: number;
    engagementScore: number;
    commissionerTrust: number;
    behaviorScore: number;
    prs: number;
}

export async function computePrs(userId: string): Promise<PrsComponents> {
    const events = await prisma.prsEvent.findMany({
        where: { userId },
        select: { eventType: true },
    });

    const hasNoData = events.length === 0;

    const seasonScore       = calcSeasonScore(events);
    const retentionScore    = calcRetentionScore(events);
    const engagementScore   = calcEngagementScore(events);
    const commissionerTrust = calcCommissionerTrust(events);
    const behaviorScore     = calcBehaviorScore(events);

    const rawPrs =
        (seasonScore       * 0.30) +
        (retentionScore    * 0.25) +
        (engagementScore   * 0.20) +
        (commissionerTrust * 0.15) +
        (behaviorScore     * 0.10);

    const prs = applyEdgeCases(clamp(Math.round(rawPrs)), events, hasNoData);

    return { seasonScore, retentionScore, engagementScore, commissionerTrust, behaviorScore, prs };
}

// ── Persist ───────────────────────────────────────────────────────────────────

export async function calculateAndSavePrs(userId: string): Promise<PrsComponents> {
    const scores = await computePrs(userId);

    await prisma.$transaction([
        prisma.prsScore.upsert({
            where: { userId },
            create: { userId, ...scores },
            update: scores,
        }),
        prisma.user.update({
            where: { id: userId },
            data: { prsScore: scores.prs },
        }),
    ]);

    return scores;
}

// ── Immediate-trigger event types ─────────────────────────────────────────────
// These event types trigger an immediate PRS recalculation on POST /prs/events.

export const IMMEDIATE_TRIGGER_EVENTS = new Set<PrsEventType>([
    'commish_approval',
    'commish_flag',
    'commish_ban',
    'verified_season',
    'season_abandoned',
    'retention_removed',
]);
