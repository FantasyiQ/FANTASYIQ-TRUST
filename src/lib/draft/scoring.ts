// FantasyiQ Trust — Live Draft Assistant v4 — Scoring Engine
// Dynamic Team Mode (WIN_NOW / BALANCED / REBUILD) adjusts need + opportunity
// multipliers. Tier-gap BPA logic: gap ≥ 2 → always BPA, gap = 1 →
// win-now comparison, gap = 0 → fill need freely.

import type { DraftContext, TeamMode } from './context';
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

// ── Multiplier tables ─────────────────────────────────────────────────────────

const MODE_NEED_MULT: Record<TeamMode, number>        = { WIN_NOW: 1.2, BALANCED: 1.0, REBUILD: 0.8 };
const MODE_OPP_MULT:  Record<TeamMode, number>        = { WIN_NOW: 1.5, BALANCED: 1.0, REBUILD: 0.7 };
const MODE_CEILING_BONUS: Record<TeamMode, number>    = { WIN_NOW: 0,   BALANCED: 0,   REBUILD: 8   }; // T1/T2 boost in REBUILD
const MODE_DEV_PENALTY:   Record<TeamMode, number>    = { WIN_NOW: -10, BALANCED: 0,   REBUILD: 0   }; // T4/T5 penalty in WIN_NOW

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

function positionDeficit(
    position: string,
    counts:   Record<string, number>,
    target:   Record<string, number>,
): number {
    return Math.max(0, (target[position] ?? 0) - (counts[position] ?? 0));
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

    const bpa = ctx.availablePlayers[0];
    if (!bpa || bpa.tier !== 1) return null;

    const tier2Available = ctx.availablePlayers.filter(p => p.tier === 2);
    if (tier2Available.length < 3) return null;

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

    const pos      = normalizePosition(player.position);
    const mode     = ctx.teamMode;

    // 1. Base: tier label
    const tierLabels = ['', 'Elite FiQ grade', 'Strong FiQ grade', 'Solid FiQ grade', 'Depth value', 'Developmental value'];
    reasons.push(tierLabels[player.tier] ?? 'Developmental value');

    // 2. Tier-gap BPA logic — gap drives base need multiplier
    const tierGap = player.tier - bpaTier;
    let baseNeedMult: number;
    if      (tierGap >= 2) baseNeedMult = 0;    // always take BPA
    else if (tierGap === 1) baseNeedMult = 0.5;  // light win-now nudge
    else                    baseNeedMult = 1.0;  // same tier — fill need

    // 3. TeamMode scales the need multiplier
    const effectiveNeedMult = baseNeedMult * MODE_NEED_MULT[mode];

    const counts  = countPositions(ctx.myEffectiveRoster);
    const target  = inferTargetBuild(ctx.scoring);
    const deficit = positionDeficit(pos, counts, target);

    if (deficit > 0 && effectiveNeedMult > 0) {
        const needBoost = Math.round(deficit * 4 * effectiveNeedMult);
        score += needBoost;
        if (needBoost > 0) reasons.push(`Need ${pos} — ${counts[pos] ?? 0}/${target[pos] ?? 0} filled`);
    }

    // 4. Opportunity score — year-1 role signal (rookies only)
    if (player.opportunityScore != null) {
        const oppMult  = MODE_OPP_MULT[mode];
        const oppBoost = Math.round((player.opportunityScore / 100) * 8 * oppMult);
        score += oppBoost;
        if (player.opportunityScore >= 70) {
            reasons.push(
                mode === 'WIN_NOW'
                    ? `High year-1 role — fits WIN NOW window (${player.opportunityScore})`
                    : `High year-1 role opportunity (${player.opportunityScore})`
            );
        } else if (player.opportunityScore >= 50) {
            reasons.push('Moderate year-1 opportunity');
        }
    }

    // 5. TeamMode ceiling bonus (REBUILD: +8 to T1/T2 — maximize future value)
    const ceilingBonus = MODE_CEILING_BONUS[mode];
    if (ceilingBonus > 0 && player.tier <= 2) {
        score += ceilingBonus;
        if (player.tier === 1) reasons.push('Elite ceiling — maximize future value');
        else reasons.push('High ceiling — prioritizing rebuild value');
    }

    // 6. TeamMode developmental penalty (WIN_NOW: -10 to T4/T5)
    const devPenalty = MODE_DEV_PENALTY[mode];
    if (devPenalty < 0 && player.tier >= 4) {
        score += devPenalty;
        reasons.push('Developmental prospect — WIN NOW mode penalized');
    }

    // 7. ADP value (reduced weight — FiQ/tier is primary signal)
    let adpVsPick: number | null = null;
    if (player.adp != null && player.adp < 9_000_000) {
        const value   = ctx.draftMeta.currentPickOverall - player.adp;
        adpVsPick     = Math.round(value);
        const clamped = Math.max(-24, Math.min(24, value));
        score        += clamped * 0.3;
        if (value >= 3)       reasons.push(`Value vs ADP: +${Math.round(value)} picks`);
        else if (value <= -3) reasons.push(`Reach vs ADP: ${Math.round(Math.abs(value))} picks early`);
    }

    // 8. Positional scarcity / IDP dampening
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
