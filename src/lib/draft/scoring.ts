// FantasyiQ Trust — Live Draft Assistant v1 — Scoring Engine
// League-aware: FiQ grade + positional need + ADP value + scarcity

import type { DraftContext } from './context';
import { normalizePosition } from './context';

export interface DraftRecommendation {
    sleeperPlayerId: string;
    name:            string;
    position:        string;
    team:            string | null;
    age:             number | null;
    fiqScore:        number;        // raw base grade (for display)
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

function positionalNeedWeight(
    position:  string,
    counts:    Record<string, number>,
    target:    Record<string, number>,
    ctx:       DraftContext,
): { delta: number; reason: string | null } {
    const have    = counts[position] ?? 0;
    const want    = target[position] ?? 0;
    const deficit = want - have;

    if (deficit <= 0) return { delta: 0, reason: null };

    // Small nudge in early rounds — don't let need override elite talent
    const isEarlyRound = ctx.draftMeta.currentRound <= 2;
    const base  = deficit * 4;
    const delta = isEarlyRound ? Math.min(base, 6) : base;

    return { delta, reason: `Need ${position} — ${have}/${want} filled` };
}

function scarcityBoost(
    position: string,
    scoring:  DraftContext['scoring'],
): { delta: number; reason: string | null } {
    if (position === 'IDP') return { delta: -35, reason: 'IDP: abundant supply, draft skill positions first' };
    if (position === 'QB' && scoring.superflex) return { delta: 10, reason: 'QB scarcity in Superflex' };
    if (position === 'TE' && scoring.tePremium) return { delta: 8,  reason: 'TE premium scoring' };
    return { delta: 0, reason: null };
}

// ── Core scorer ───────────────────────────────────────────────────────────────

export function scoreCandidate(
    player: DraftContext['availablePlayers'][number],
    ctx:    DraftContext,
): DraftRecommendation & { compositeScore: number } {
    const reasons: string[] = [];
    let score = player.fiqScore;

    const pos = normalizePosition(player.position);

    // 1. Base: contextual grade label
    if      (player.fiqScore >= 85) reasons.push('Elite FiQ grade');
    else if (player.fiqScore >= 75) reasons.push('Strong FiQ grade');
    else if (player.fiqScore >= 65) reasons.push('Solid FiQ grade');
    else                             reasons.push('Developmental value');

    // 2. Positional need — uses full effective roster (existing + this draft)
    const counts = countPositions(ctx.myEffectiveRoster);
    const target = inferTargetBuild(ctx.scoring);
    const need   = positionalNeedWeight(pos, counts, target, ctx);
    score += need.delta;
    if (need.reason) reasons.push(need.reason);

    // 3. ADP value
    let adpVsPick: number | null = null;
    if (player.adp != null && player.adp < 9_000_000) {
        const value   = ctx.draftMeta.currentPickOverall - player.adp;
        adpVsPick     = Math.round(value);
        const clamped = Math.max(-24, Math.min(24, value));
        score        += clamped * 0.5;
        if (value >= 3)       reasons.push(`Value vs ADP: +${Math.round(value)} picks`);
        else if (value <= -3) reasons.push(`Reach vs ADP: ${Math.round(Math.abs(value))} picks early`);
    }

    // 4. Positional scarcity / dampening
    const sc = scarcityBoost(pos, ctx.scoring);
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
        adpVsPick,
        compositeScore:  Math.round(score),
        reasons:         reasons.slice(0, 3),
    };
}

export function rankCandidates(ctx: DraftContext): DraftRecommendation[] {
    return ctx.availablePlayers
        .map(p => scoreCandidate(p, ctx))
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, 10)
        .map(({ compositeScore: _, ...rec }) => rec);
}
