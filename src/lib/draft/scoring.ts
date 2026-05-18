// FantasyiQ Trust — Live Draft Assistant v5 — Scoring Engine
//
// Architecture:
//   Base score (FiQ + tier)
//   + TeamMode weights (WIN_NOW / BALANCED / REBUILD from roster snapshot)
//   + TrajectoryiQ weights (WIN_NOW / ASCENDING / PLATEAU / REBUILD from forward-looking engine)
//   + Positional need (tier-gap gated)
//   + Opportunity score (year-1 role, rookies only)
//   + Draft Pool ADP value (0.3× weight — FiQ is primary)
//   + IDP / scarcity dampening
//
// Guardrail: tier-gap ≥ 2 always takes BPA. Trajectory tilts within a tier;
// it never makes you take T3 over T1.

import type { DraftContext, TeamMode, TrajectoryWindow, DraftProfile } from './context';
import { normalizePosition, getDraftPoolADPDelta } from './context';

export interface DraftRecommendation {
    sleeperPlayerId: string;
    name:            string;
    position:        string;
    team:            string | null;
    age:             number | null;
    fiqScore:        number;          // raw base grade (for display)
    tier:            number;          // 1–5 FiQ tier
    adpVsPick:       number | null;   // positive = value pick, negative = reach
    trajectoryNote:  string | null;   // shown only when trajectory materially drove the pick
    reasons:         string[];        // up to 3 bullets
}

// ── Effective mode reconciliation ─────────────────────────────────────────────
//
// Guardrail from spec: if teamMode and trajectoryWindow fully disagree,
// clamp to BALANCED rather than picking an arbitrary winner.
//
// Agreement table:
//   WIN_NOW + WIN_NOW/PLATEAU  → WIN_NOW   (aggressive win-now)
//   REBUILD + REBUILD/ASCENDING → REBUILD  (deep rebuild)
//   WIN_NOW + REBUILD          → BALANCED  (clamp — contradictory signals)
//   REBUILD + WIN_NOW          → BALANCED  (clamp — contradictory signals)
//   everything else            → BALANCED
//
function resolveEffectiveMode(profile: DraftProfile): TeamMode {
    const { teamMode, trajectoryWindow } = profile;
    if (teamMode === 'WIN_NOW' && (trajectoryWindow === 'WIN_NOW' || trajectoryWindow === 'PLATEAU')) return 'WIN_NOW';
    if (teamMode === 'REBUILD' && (trajectoryWindow === 'REBUILD' || trajectoryWindow === 'ASCENDING')) return 'REBUILD';
    if (teamMode === 'WIN_NOW' && trajectoryWindow === 'REBUILD') return 'BALANCED'; // contradictory — clamp
    if (teamMode === 'REBUILD' && trajectoryWindow === 'WIN_NOW') return 'BALANCED'; // contradictory — clamp
    return 'BALANCED';
}

// ── TeamMode multiplier tables ────────────────────────────────────────────────

const MODE_NEED_MULT:     Record<TeamMode, number> = { WIN_NOW: 1.2, BALANCED: 1.0, REBUILD: 0.8 };
const MODE_OPP_MULT:      Record<TeamMode, number> = { WIN_NOW: 1.5, BALANCED: 1.0, REBUILD: 0.7 };
const MODE_CEILING_BONUS: Record<TeamMode, number> = { WIN_NOW: 0,   BALANCED: 0,   REBUILD: 8   };
const MODE_DEV_PENALTY:   Record<TeamMode, number> = { WIN_NOW: -10, BALANCED: 0,   REBUILD: 0   };

// ── Trajectory modifier tables ────────────────────────────────────────────────
//
// Applied ON TOP of TeamMode multipliers as a "directional tilt."
// These are fractional adjustments — they nudge, not dominate.

/** Additional multiplier on opportunity score boost. */
const TRAJ_OPP_MULT: Record<TrajectoryWindow, number> = {
    WIN_NOW:   1.7,   // year-1 role premium — fits the win window
    ASCENDING: 0.8,   // future-leaning — don't over-weight immediate role
    PLATEAU:   1.0,
    REBUILD:   0.6,   // deep rebuild — role is irrelevant vs ceiling
};

/** Multiplier on ceiling bonus (T1/T2). Stacks with mode ceiling bonus.
 *  For modes where ceiling bonus = 0, ASCENDING provides a floor. */
const TRAJ_CEILING_MULT: Record<TrajectoryWindow, number> = {
    WIN_NOW:   0.9,   // slight depression — prefer roles over luxury
    ASCENDING: 1.6,   // maximize future ceiling
    PLATEAU:   1.0,
    REBUILD:   1.25,  // +10 instead of +8 for T1/T2
};

/** Additional multiplier on need boost. */
const TRAJ_NEED_MULT: Record<TrajectoryWindow, number> = {
    WIN_NOW:   1.0,
    ASCENDING: 1.0,
    PLATEAU:   1.0,
    REBUILD:   0.7,   // rebuild — don't fill need at expense of ceiling
};

/** Youth bonus base points for T1/T2 with age ≤ 24 (trajectory age signal). */
const TRAJ_YOUTH_BONUS: Record<TrajectoryWindow, number> = {
    WIN_NOW:   0,
    ASCENDING: 5,   // ascending teams value young T1/T2 players (+age curve bonus)
    PLATEAU:   0,
    REBUILD:   3,
};

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
    return { QB: scoring.superflex ? 3 : 2, RB: 5, WR: 7, TE: 2 };
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

function ceilingBonusForPlayer(
    tier:     number,
    mode:     TeamMode,
    trajWin:  TrajectoryWindow,
): number {
    if (tier > 2) return 0;
    const modeBase  = MODE_CEILING_BONUS[mode]; // REBUILD=8, others=0
    const trajMult  = TRAJ_CEILING_MULT[trajWin];
    // For ASCENDING/REBUILD trajectories, even a zero-base mode gets a floor bonus
    const base      = trajWin === 'ASCENDING' ? Math.max(modeBase, 5) :
                      trajWin === 'REBUILD'   ? Math.max(modeBase, 8) :
                      modeBase;
    return Math.round(base * trajMult);
}

function devPenalty(
    tier:          number,
    mode:          TeamMode,
    trajWin:       TrajectoryWindow,
    riskTolerance: DraftProfile['riskTolerance'],
): number {
    if (tier < 4) return 0;
    // WIN_NOW trajectory with HIGH risk = suppress the developmental penalty
    // (allow boom/bust profiles)
    if (trajWin === 'WIN_NOW' && riskTolerance === 'HIGH') return 0;
    return MODE_DEV_PENALTY[mode]; // WIN_NOW=-10, others=0
}

// ── Trade-down detection (profile-aware) ─────────────────────────────────────

export function detectTradeDown(ctx: DraftContext): string | null {
    if (ctx.availablePlayers.length === 0) return null;

    const bpa    = ctx.availablePlayers[0];
    if (!bpa || bpa.tier !== 1) return null;

    const tier2Available = ctx.availablePlayers.filter(p => p.tier === 2);
    if (tier2Available.length < 3) return null;

    const counts = countPositions(ctx.myEffectiveRoster);
    const target = inferTargetBuild(ctx.scoring);
    const tier2FillsNeed = tier2Available.some(p =>
        positionDeficit(normalizePosition(p.position), counts, target) > 0
    );
    if (!tier2FillsNeed) return null;

    const profile  = ctx.draftProfile;
    const effective = resolveEffectiveMode(profile);
    const spots    = Math.min(6, tier2Available.length);

    // Aggressive Win-Now: less likely to trade down out of elite talent
    if (effective === 'WIN_NOW' && profile.trajectoryWindow === 'WIN_NOW') {
        // Only fire if horizonYears > 1 (even win-now teams shouldn't always reach)
        if (profile.horizonYears <= 1) return null;
    }

    const windowLabel =
        profile.trajectoryWindow === 'WIN_NOW'   ? 'Your trajectory is WIN‑NOW' :
        profile.trajectoryWindow === 'REBUILD'    ? 'Your trajectory is REBUILD' :
        profile.trajectoryWindow === 'ASCENDING'  ? 'Your trajectory is ASCENDING' :
        'Your trajectory is PLATEAU';

    if (effective === 'REBUILD') {
        return `${windowLabel}: consider trading down ${Math.min(3, spots)}–${spots} spots — ${tier2Available.length} Tier 2 players remain who fit your rebuild window, and you gain extra draft capital`;
    }

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

    const pos     = normalizePosition(player.position);
    const profile = ctx.draftProfile;
    const mode    = resolveEffectiveMode(profile);
    const traj    = profile.trajectoryWindow;
    const risk    = profile.riskTolerance;

    let trajectoryNote: string | null = null;

    // 1. Base: tier label
    const tierLabels = ['', 'Elite FiQ grade', 'Strong FiQ grade', 'Solid FiQ grade', 'Depth value', 'Developmental value'];
    reasons.push(tierLabels[player.tier] ?? 'Developmental value');

    // 2. Tier-gap BPA logic — gap drives base need multiplier
    const tierGap = player.tier - bpaTier;
    let baseNeedMult: number;
    if      (tierGap >= 2)  baseNeedMult = 0;    // always take BPA — tier dominates
    else if (tierGap === 1) baseNeedMult = 0.5;   // light nudge
    else                    baseNeedMult = 1.0;   // same tier — fill need freely

    // 3. Need — stacked mode × trajectory multipliers
    const effectiveNeedMult = baseNeedMult * MODE_NEED_MULT[mode] * TRAJ_NEED_MULT[traj];
    const counts  = countPositions(ctx.myEffectiveRoster);
    const target  = inferTargetBuild(ctx.scoring);
    const deficit = positionDeficit(pos, counts, target);

    if (deficit > 0 && effectiveNeedMult > 0) {
        const needBoost = Math.round(deficit * 4 * effectiveNeedMult);
        score += needBoost;
        if (needBoost > 0) reasons.push(`Need ${pos} — ${counts[pos] ?? 0}/${target[pos] ?? 0} filled`);
    }

    // 4. Opportunity score — year-1 role signal (rookies only)
    //    Stacked: mode opp mult × trajectory opp mult
    if (player.opportunityScore != null) {
        const oppMult  = MODE_OPP_MULT[mode] * TRAJ_OPP_MULT[traj];
        const oppBoost = Math.round((player.opportunityScore / 100) * 8 * oppMult);
        score += oppBoost;
        if (player.opportunityScore >= 70) {
            if (traj === 'WIN_NOW') {
                const msg = `High year-1 role — fits WIN‑NOW ${profile.horizonYears}-year window (${player.opportunityScore})`;
                reasons.push(msg);
                trajectoryNote = 'Aligns with WIN‑NOW window.';
            } else {
                reasons.push(`High year-1 role opportunity (${player.opportunityScore})`);
            }
        } else if (player.opportunityScore >= 50) {
            reasons.push('Moderate year-1 opportunity');
        }
    }

    // 5. Ceiling bonus (T1/T2) — trajectory-aware
    const cBonus = ceilingBonusForPlayer(player.tier, mode, traj);
    if (cBonus > 0) {
        score += cBonus;
        if (traj === 'ASCENDING') {
            reasons.push('High ceiling, fits ASCENDING arc');
            trajectoryNote = `High ceiling, fits ${profile.horizonYears}-year ASCENDING arc.`;
        } else if (traj === 'REBUILD') {
            reasons.push('Elite ceiling — maximize future value');
            if (player.tier <= 2) trajectoryNote = 'Developmental profile fits REBUILD trajectory.';
        } else if (player.tier === 1) {
            reasons.push('Elite ceiling');
        }
    }

    // 6. Developmental penalty (T4/T5 in WIN_NOW, suppressed by HIGH risk tolerance)
    const dp = devPenalty(player.tier, mode, traj, risk);
    if (dp < 0) {
        score += dp;
        if (player.tier >= 4) trajectoryNote = 'Developmental profile — only recommended despite WIN‑NOW mode.';
        reasons.push('Developmental prospect — WIN NOW mode penalized');
    }

    // 7. Youth bonus — ASCENDING / REBUILD trajectories value young T1/T2 highly
    const youthBonus = TRAJ_YOUTH_BONUS[traj];
    if (youthBonus > 0 && player.tier <= 2 && player.age != null && player.age <= 24) {
        const bonus = Math.round(youthBonus * ((25 - player.age) / 3));
        score += bonus;
        if (traj === 'ASCENDING') {
            reasons.push(`Age ${player.age} — young T${player.tier} fits ASCENDING window`);
        }
    }

    // 8. Draft Pool ADP value (0.3× weight — FiQ/tier is primary)
    let adpVsPick: number | null = null;
    const poolADPDelta = getDraftPoolADPDelta(
        ctx.draftPoolADP,
        player.sleeperPlayerId,
        ctx.draftMeta.currentPickOverall,
    );
    if (poolADPDelta != null) {
        adpVsPick     = poolADPDelta;
        const clamped = Math.max(-24, Math.min(24, poolADPDelta));
        score        += clamped * 0.3;
        if (poolADPDelta >= 3)       reasons.push(`Value vs Draft Pool ADP: +${poolADPDelta} picks`);
        else if (poolADPDelta <= -3) reasons.push(`Reach vs Draft Pool ADP: ${Math.abs(poolADPDelta)} picks early`);
    }

    // 9. Positional scarcity / IDP dampening
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
        trajectoryNote,
        compositeScore:  Math.round(score),
        reasons:         reasons.slice(0, 3),
    };
}

export function rankCandidates(ctx: DraftContext): DraftRecommendation[] {
    if (ctx.availablePlayers.length === 0) return [];

    const bpaTier = ctx.availablePlayers[0].tier;

    return ctx.availablePlayers
        .map(p => scoreCandidate(p, ctx, bpaTier))
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, 10)
        .map(({ compositeScore: _, ...rec }) => rec);
}
