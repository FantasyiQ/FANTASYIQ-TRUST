// FantasyiQ Trust — Live Draft Assistant v1 — Scoring Engine
// League-aware: FiQ grade + positional need + ADP value + scarcity

import type { DraftContext } from './context';

export interface DraftRecommendation {
    sleeperPlayerId: string;
    name:            string;
    position:        string;
    team:            string | null;
    age:             number | null;
    fiqScore:        number;       // raw base grade (for display)
    adpVsPick:       number | null; // positive = value pick, negative = reach
    reasons:         string[];     // up to 3 bullets
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countPositions(roster: DraftContext['myRoster']): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of roster) counts[p.position] = (counts[p.position] ?? 0) + 1;
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
    position: string,
    counts:   Record<string, number>,
    target:   Record<string, number>,
): { delta: number; reason: string | null } {
    const have    = counts[position] ?? 0;
    const need    = target[position] ?? 3;
    const deficit = need - have;

    if (deficit >= 3)  return { delta: 15, reason: `Big need at ${position} — ${have}/${need} filled` };
    if (deficit === 2) return { delta: 10, reason: `Need ${position} — ${have}/${need} filled` };
    if (deficit === 1) return { delta: 5,  reason: `Light at ${position}` };
    if (deficit <= -2) return { delta: -12, reason: `Stacked at ${position}` };
    return { delta: 0, reason: null };
}

function scarcityBoost(
    position: string,
    scoring:  DraftContext['scoring'],
): { delta: number; reason: string | null } {
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

    // 1. Base: contextual grade label
    if      (player.fiqScore >= 85) reasons.push('Elite FiQ grade');
    else if (player.fiqScore >= 75) reasons.push('Strong FiQ grade');
    else if (player.fiqScore >= 65) reasons.push('Solid FiQ grade');
    else                             reasons.push('Developmental value');

    // 2. Positional need
    const counts = countPositions(ctx.myRoster);
    const target = inferTargetBuild(ctx.scoring);
    const need   = positionalNeedWeight(player.position, counts, target);
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

    // 4. Positional scarcity (SF / TE+)
    const sc = scarcityBoost(player.position, ctx.scoring);
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
