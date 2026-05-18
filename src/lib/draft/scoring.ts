// FantasyiQ Trust — Live Draft Assistant v3 — Scoring Engine
// Tier-gap BPA: tier gap ≥ 2 → always BPA, gap = 1 → win-now comparison,
// gap = 0 → fill need. Opportunity score as year-1 role tiebreaker.

import type { DraftContext } from './context';
import { normalizePosition } from './context';

export interface DraftRecommendation {
    sleeperPlayerId: string;
    name:            string;
    position:        string;
    team:            string | null;
    age:             number | null;
    fiqScore:        number;        // raw base grade (for display)
    tier:            number;        // 1–5 FiQ tier
    adpVsPick:       number | null; // positive = value pick, negative = reach
    reasons:         string[];      // up to 3 bullets
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countPositions(roster: { position: string }[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of roster) {
        const pos = normalizePosition(p.position);
        counts[pos] = (counts[pos] ?? 0) + 1;
    }
    return counts;
}

function inferTargetBuild(scoring: DraftContext['scoring']): Record<string, number> {
    return {
        QB: scoring.superflex ? 3 : 2,
        RB: 5,
        WR: 7,
        TE: 2,
    };
}

/** Returns how many positions this player would fill (1 = fills a need). */
function positionDeficit(
    position: string,
    counts:   Record<string, number>,
    target:   Record<string, number>,
): number {
    const have = counts[position] ?? 0;
    const want = target[position] ?? 0;
    return Math.max(0, want - have);
}

function scarcityDelta(
    position: string,
    scoring:  DraftContext['scoring'],
): { delta: number; reason: string | null } {
    if (position === 'IDP') return { delta: -35, reason: 'IDP: abundant supply, draft skill positions first' };
    if (position === 'QB' && scoring.superflex) return { delta: 10, reason: 'QB scarcity in Superflex' };
    if (position === 'TE' && scoring.tePremium) return { delta: 8,  reason: 'TE premium scoring' };
    return { delta: 0, reason: null };
}

// ── Trade-down detection ──────────────────────────────────────────────────────

export function detectTradeDown(ctx: DraftContext): string | null {
    if (ctx.availablePlayers.length === 0) return null;

    // BPA = top available player by raw fiqScore
    const bpa = ctx.availablePlayers[0];
    if (!bpa || bpa.tier !== 1) return null;

    // Count Tier 2 players still available
    const tier2Available = ctx.availablePlayers.filter(p => p.tier === 2);
    if (tier2Available.length < 3) return null;

    // Does any Tier 2 player fill a positional need?
    const counts = countPositions(ctx.myEffectiveRoster);
    const target = inferTargetBuild(ctx.scoring);

    const tier2FillsNeed = tier2Available.some(p => {
        const pos = normalizePosition(p.position);
        return positionDeficit(pos, counts, target) > 0;
    });

    if (!tier2FillsNeed) return null;

    const spots = Math.min(6, tier2Available.length);
    return `Trade down ${Math.min(3, spots)}–${spots} spots — ${tier2Available.length} Tier 2 players remain who fit your team, and you can gain extra draft capital`;
}

// ── Core scorer ───────────────────────────────────────────────────────────────

export function scoreCandidate(
    player:   DraftContext['availablePlayers'][number],
    ctx:      DraftContext,
    bpaTier:  number,
): DraftRecommendation & { compositeScore: number } {
    const reasons: string[] = [];
    let score = player.fiqScore;

    const pos = normalizePosition(player.position);

    // 1. Base: tier label
    const tierLabels = ['', 'Elite FiQ grade', 'Strong FiQ grade', 'Solid FiQ grade', 'Depth value', 'Developmental value'];
    reasons.push(tierLabels[player.tier] ?? 'Developmental value');

    // 2. Tier-gap BPA logic
    const tierGap = player.tier - bpaTier;   // 0 = same tier as BPA, positive = worse than BPA
    const counts  = countPositions(ctx.myEffectiveRoster);
    const target  = inferTargetBuild(ctx.scoring);
    const deficit = positionDeficit(pos, counts, target);

    let needMultiplier: number;
    if      (tierGap >= 2) needMultiplier = 0;    // always take BPA — don't let need override elite talent
    else if (tierGap === 1) needMultiplier = 0.5;  // slight nudge for win-now alignment
    else                    needMultiplier = 1.0;  // same tier — fill need

    if (deficit > 0 && needMultiplier > 0) {
        const needBoost = Math.round(deficit * 4 * needMultiplier);
        score += needBoost;
        if (needBoost > 0) reasons.push(`Need ${pos} — ${counts[pos] ?? 0}/${target[pos] ?? 0} filled`);
    }

    // 3. Opportunity score — year-1 role tiebreaker (rookies only, +0 to +8)
    if (player.opportunityScore != null) {
        const oppBoost = Math.round((player.opportunityScore / 100) * 8);
        score += oppBoost;
        if (player.opportunityScore >= 70) reasons.push(`High year-1 role opportunity (${player.opportunityScore})`);
        else if (player.opportunityScore >= 50) reasons.push(`Moderate year-1 opportunity`);
    }

    // 4. ADP value (reduced weight — FiQ is primary signal)
    let adpVsPick: number | null = null;
    if (player.adp != null && player.adp < 9_000_000) {
        const value   = ctx.draftMeta.currentPickOverall - player.adp;
        adpVsPick     = Math.round(value);
        const clamped = Math.max(-24, Math.min(24, value));
        score        += clamped * 0.3;
        if (value >= 3)       reasons.push(`Value vs ADP: +${Math.round(value)} picks`);
        else if (value <= -3) reasons.push(`Reach vs ADP: ${Math.round(Math.abs(value))} picks early`);
    }

    // 5. Positional scarcity / IDP dampening
    const sc = scarcityDelta(pos, ctx.scoring);
    if (sc.delta !== 0) {
        score += sc.delta;
        if (sc.reason) reasons.push(sc.reason);
    }

    return {
        sleeperPlayerId: player.sleeperPlayerId,
        name:            player.name,
        position:        player.position,
        team:            player.team,
        age:             player.age,
        fiqScore:        player.fiqScore,
        tier:            player.tier,
        adpVsPick,
        compositeScore:  Math.round(score),
        reasons:         reasons.slice(0, 3),
    };
}

export function rankCandidates(ctx: DraftContext): DraftRecommendation[] {
    if (ctx.availablePlayers.length === 0) return [];

    // Two-pass: determine BPA tier first, then score relative to it
    const bpaTier = ctx.availablePlayers[0].tier;

    return ctx.availablePlayers
        .map(p => scoreCandidate(p, ctx, bpaTier))
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, 10)
        .map(({ compositeScore: _, ...rec }) => rec);
}
