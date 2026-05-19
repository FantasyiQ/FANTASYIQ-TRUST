// FantasyiQ Trust — FiQ Draft Report Card Engine v3.3
// Post-draft audit: did you draft according to your Effective Mode and Trajectory?

import type { DraftProfile, TrajectoryWindow } from './context';
import { normalizePosition } from './context';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PickGrade      = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
export type ClassStrength  = 'weak' | 'average' | 'strong';
export type DraftStrategy  = 'Value' | 'Balanced' | 'Upside';

export interface PickAlignment {
    pickOverall:     number;
    round:           number;
    pickInRound:     number;
    sleeperPlayerId: string;
    playerName:      string;
    position:        string;
    team:            string | null;
    age:             number | null;
    tier:            number;
    fiqScore:        number;
    opportunityScore: number | null;
    bpaTierAtPick:   number | null;
    bpaFiqAtPick:    number | null;   // fiqScore of best available player at this pick
    vop:             number;          // value over pick slot
    tierFit:         number;          // 0–5
    modeFit:         number;          // 0–5
    trajectoryFit:   number;          // 0–5
    needFit:         number;          // 0–5
    opportunityFit:  number;          // 0–5
    totalScore:      number;          // 0–25
    grade:           PickGrade;
    gradeNote:       string;
}

export interface TierDistribution {
    T1: number; T2: number; T3: number; T4: number; T5: number;
    leagueAvg: { T1: number; T2: number; T3: number; T4: number; T5: number };
}

export interface PositionCoreScore {
    position: string;
    grade:    'A' | 'B' | 'C' | 'D' | 'F';
    avgFiq:   number;
    count:    number;
    label:    string;
}

export interface FranchiseState {
    trajectoryWindow:    string;
    horizonYears:        number;
    overallScore:        number;
    coreStrength:        PositionCoreScore[];
    positionStability:   { stable: string[]; fragile: string[]; critical: string[] };
    ageCurve:            { young: number; prime: number; aging: number };
    winProbabilityDelta: number;
    dynastyOutlook:      string;
}

export interface DraftReportCard {
    picks:            PickAlignment[];
    identity:         string;
    identityGrade:    PickGrade;
    avgScore:         number;
    tierDistribution: TierDistribution;
    classStrength:    ClassStrength;
    draftStrategy:    DraftStrategy;
    totalVop:         number;
    franchise:        FranchiseState;
    draftProfile:     DraftProfile;
}

// ── Player pool entry ─────────────────────────────────────────────────────────

export interface PoolPlayer {
    sleeperPlayerId: string;
    playerName:      string;
    position:        string;
    team:            string | null;
    age:             number | null;
    fiqScore:        number;
    tier:            number;
    opportunityScore?: number | null;
}

// ── Grade helpers ─────────────────────────────────────────────────────────────

// v3.3: wider bands, less punitive — makes grades feel fun and readable
function gradeFromScore(score: number): PickGrade {
    if (score >= 22) return 'A+';
    if (score >= 19) return 'A';
    if (score >= 16) return 'B';
    if (score >= 12) return 'C';
    if (score >= 8)  return 'D';
    return 'F';
}

function posGrade(avgFiq: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (avgFiq >= 80) return 'A';
    if (avgFiq >= 70) return 'B';
    if (avgFiq >= 60) return 'C';
    if (avgFiq >= 50) return 'D';
    return 'F';
}

// ── Class strength & tier scaling ─────────────────────────────────────────────

// v3.3: class strength prevents T3 picks from being punished in weak draft classes
function computeClassStrength(pool: PoolPlayer[]): ClassStrength {
    const t1    = pool.filter(p => p.tier === 1).length;
    const elite = pool.filter(p => p.tier <= 2).length;
    if (t1 >= 8 || elite >= 20) return 'strong';
    if (t1 <= 2 || elite <= 6)  return 'weak';
    return 'average';
}

function tierValuesForClass(cs: ClassStrength): Record<number, number> {
    if (cs === 'weak')   return { 1: 98, 2: 87, 3: 72, 4: 57, 5: 42 };  // T3 = neutral in weak class
    if (cs === 'strong') return { 1: 92, 2: 78, 3: 62, 4: 53, 5: 38 };  // T3 slightly negative
    return                      { 1: 95, 2: 82, 3: 68, 4: 55, 5: 40 };  // average
}

// ── Draft strategy ────────────────────────────────────────────────────────────

function computeDraftStrategy(dist: { T1: number; T2: number; T3: number; T4: number; T5: number }): DraftStrategy {
    const total = dist.T1 + dist.T2 + dist.T3 + dist.T4 + dist.T5;
    if (total === 0) return 'Balanced';
    if ((dist.T1 + dist.T2) / total >= 0.40) return 'Upside';
    if ((dist.T4 + dist.T5) / total >= 0.40) return 'Value';
    return 'Balanced';
}

// ── Per-component alignment scores ────────────────────────────────────────────

function tierFitScore(playerTier: number, bpaTier: number): number {
    const gap = playerTier - bpaTier;
    if (gap <= 0) return 5;
    if (gap === 1) return 3;
    if (gap === 2) return 2;
    return 1;
}

function modeFitScore(
    tier: number,
    opp: number | null | undefined,
    age: number | null | undefined,
    effectiveMode: DraftProfile['teamMode'],
): number {
    if (effectiveMode === 'WIN_NOW') {
        if (tier === 1 || tier === 2) {
            if ((opp ?? 0) >= 70) return 5;
            if ((opp ?? 0) >= 50) return 4;
            return 3;
        }
        if (tier === 3 && (opp ?? 0) >= 70) return 4;
        if (tier === 3) return 2;
        return 1;
    }
    if (effectiveMode === 'REBUILD') {
        if (tier <= 2) return 5;
        if (tier === 3 && (age ?? 99) <= 22) return 4;
        if (tier === 3) return 3;
        return 2;
    }
    // BALANCED
    return Math.max(1, 6 - tier);
}

function trajectoryFitScore(
    tier: number,
    opp: number | null | undefined,
    age: number | null | undefined,
    traj: TrajectoryWindow,
    horizonYears: number,
    fills: boolean,
): number {
    if (traj === 'WIN_NOW' || horizonYears === 1) {
        if ((opp ?? 0) >= 70 && fills) return 5;
        if ((opp ?? 0) >= 70) return 4;
        if ((opp ?? 0) >= 50) return 3;
        return 2;
    }
    if (traj === 'ASCENDING') {
        if (tier <= 2 && (age ?? 99) <= 23) return 5;
        if (tier <= 2 && (age ?? 99) <= 25) return 4;
        if (tier <= 2) return 3;
        if (tier === 3) return 2;
        return 1;
    }
    if (traj === 'REBUILD') {
        if (tier <= 2) return 5;
        if (tier === 3) return 3;
        return 2;
    }
    // PLATEAU
    return Math.max(1, 6 - tier);
}

function needFitScore(deficit: number, fills: boolean): number {
    if (!fills) return 2;
    if (deficit >= 3) return 5;
    if (deficit === 2) return 4;
    return 3;
}

function opportunityFitScore(
    opp: number | null | undefined,
    traj: TrajectoryWindow,
): number {
    const o = opp ?? null;
    if (traj === 'WIN_NOW') {
        if (o == null) return 2;
        if (o >= 70) return 5;
        if (o >= 50) return 3;
        return 2;
    }
    if (traj === 'ASCENDING') {
        if (o == null) return 3;
        if (o >= 70) return 3;
        if (o >= 50) return 4;
        return 3;
    }
    if (traj === 'REBUILD') {
        if (o == null) return 4;
        if (o >= 70) return 2;
        return 3;
    }
    // PLATEAU
    if (o == null) return 3;
    if (o >= 70) return 4;
    if (o >= 50) return 3;
    return 2;
}

// ── Grade note generator v3.3 ─────────────────────────────────────────────────
//
// v3.3 rules for BPA note suppression:
// Only surface "T1 was available" when ALL are true:
//   1. A T1 was actually available (bpaTierAtPick === 1)
//   2. FiQ gap between T1 and the picked player is ≤ 10 (close decision)
//   3. modeFit >= 3 (player fits your mode)
//   4. trajectoryFit >= 3 (player fits your trajectory)
//   5. fills === true OR it's already a tight BPA tie
// Otherwise use positive/contextual framing.

function gradeNote(pick: Omit<PickAlignment, 'gradeNote' | 'grade'>): string {
    const parts: string[] = [];
    const { tierFit, modeFit, trajectoryFit, needFit, opportunityFit } = pick;
    const top = Math.max(tierFit, modeFit, trajectoryFit);

    const t1Available = pick.bpaTierAtPick === 1 && pick.tier > 1;
    const fiqGap      = pick.bpaFiqAtPick != null ? (pick.bpaFiqAtPick - pick.fiqScore) : null;
    const tightDecision = fiqGap != null && fiqGap <= 10;

    // Tier fit messaging
    if (tierFit === 5) {
        parts.push(`Matched BPA at T${pick.tier}`);
    } else if (t1Available) {
        if (tightDecision && modeFit >= 3 && trajectoryFit >= 3) {
            // Close decision — show the note constructively
            parts.push(`T${pick.tier} pick; T1 was close in value and fits your build`);
        } else {
            // T1 exists but doesn't fully fit context — softer framing
            parts.push(`T${pick.tier} pick that fits your mode and trajectory`);
        }
    } else if (tierFit <= 2 && pick.bpaTierAtPick != null && pick.bpaTierAtPick < pick.tier) {
        parts.push(`T${pick.tier} pick; T${pick.bpaTierAtPick} was available — consider your build direction`);
    }

    // Positive signals
    if (modeFit >= 4 && pick.tier <= 2) parts.push('Strong mode fit');
    if (opportunityFit === 5) parts.push('High year-1 role — fits your window');
    if (opportunityFit === 2 && pick.opportunityScore != null && pick.opportunityScore >= 70)
        parts.push('High-role profile, but rebuild window prefers ceiling over year-1 role');
    if (trajectoryFit >= 4 && pick.age != null && pick.age <= 23)
        parts.push(`Age ${pick.age} — young T${pick.tier} aligns with your trajectory`);
    if (needFit >= 4) parts.push(`Strengthens ${pick.position} depth`);
    if (pick.vop > 5) parts.push(`+${Math.round(pick.vop)} VOP — strong value at this slot`);

    if (parts.length === 0) {
        if (top >= 4) parts.push('Good pick for your build');
        else if (top >= 3) parts.push('Solid alignment with your draft profile');
        else parts.push('Mixed fit — revisit positional balance in next window');
    }

    return parts.slice(0, 2).join('. ') + '.';
}

// ── Resolve effective mode ────────────────────────────────────────────────────

function resolveEffectiveMode(profile: DraftProfile): DraftProfile['teamMode'] {
    const { teamMode, trajectoryWindow } = profile;
    if (teamMode === 'WIN_NOW' && (trajectoryWindow === 'WIN_NOW' || trajectoryWindow === 'PLATEAU')) return 'WIN_NOW';
    if (teamMode === 'REBUILD' && (trajectoryWindow === 'REBUILD' || trajectoryWindow === 'ASCENDING')) return 'REBUILD';
    if (teamMode === 'WIN_NOW' && trajectoryWindow === 'REBUILD') return 'BALANCED';
    if (teamMode === 'REBUILD' && trajectoryWindow === 'WIN_NOW') return 'BALANCED';
    return 'BALANCED';
}

// ── v3.3 trajectory from roster (fixes PLATEAU everywhere) ───────────────────
//
// Applied when trajectory engine returns PLATEAU or data is unavailable.
// Uses age curve and overall score to derive a meaningful window.

function deriveTrajectoryFromRoster(
    overallScore: number,
    ageCurve: { young: number; prime: number; aging: number },
): TrajectoryWindow {
    const { young, prime, aging } = ageCurve;
    if (overallScore >= 70 && aging >= prime)         return 'WIN_NOW';
    if (young >= 2 * aging && overallScore >= 55)     return 'ASCENDING';
    if (overallScore <= 50 && young >= prime)         return 'REBUILD';
    return 'PLATEAU';
}

// ── League-average tier distribution ─────────────────────────────────────────

function computeLeagueAvgTiers(
    allPicks: { player_id: string }[],
    pool: PoolPlayer[],
    totalTeams: number,
): TierDistribution['leagueAvg'] {
    const tierByPlayerId = new Map(pool.map(p => [p.sleeperPlayerId, p.tier]));
    const counts = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
    for (const p of allPicks) {
        const t = tierByPlayerId.get(p.player_id);
        if (t) counts[`T${t}` as keyof typeof counts] = (counts[`T${t}` as keyof typeof counts] ?? 0) + 1;
    }
    const n = Math.max(1, totalTeams);
    return {
        T1: Math.round((counts.T1 / n) * 10) / 10,
        T2: Math.round((counts.T2 / n) * 10) / 10,
        T3: Math.round((counts.T3 / n) * 10) / 10,
        T4: Math.round((counts.T4 / n) * 10) / 10,
        T5: Math.round((counts.T5 / n) * 10) / 10,
    };
}

// ── Franchise section ─────────────────────────────────────────────────────────

export interface RichRosterPlayer {
    position: string;
    age:      number | null;
    fiqScore: number;
}

const AGE_YOUNG: Record<string, number> = { QB: 25, RB: 23, WR: 24, TE: 24 };
const AGE_AGING: Record<string, number> = { QB: 32, RB: 28, WR: 30, TE: 30 };
const AGE_TARGET: Record<string, number> = { QB: 2, RB: 4, WR: 6, TE: 2 };

function computeCoreStrength(players: RichRosterPlayer[]): PositionCoreScore[] {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    return positions.map(pos => {
        const group = players.filter(p => normalizePosition(p.position) === pos);
        if (group.length === 0) return { position: pos, grade: 'F' as const, avgFiq: 0, count: 0, label: `${pos} Core` };
        const avg = Math.round(group.reduce((s, p) => s + p.fiqScore, 0) / group.length);
        return { position: pos, grade: posGrade(avg), avgFiq: avg, count: group.length, label: `${pos} Core` };
    });
}

function computePositionStability(
    players: RichRosterPlayer[],
    coreStrength: PositionCoreScore[],
): { stable: string[]; fragile: string[]; critical: string[] } {
    const stable: string[] = [], fragile: string[] = [], critical: string[] = [];
    for (const cs of coreStrength) {
        const target = AGE_TARGET[cs.position] ?? 2;
        const filled = cs.count >= target;
        if (cs.grade === 'A' || (cs.grade === 'B' && filled)) stable.push(cs.position);
        else if (cs.grade === 'F' || (!filled && cs.count === 0)) critical.push(cs.position);
        else fragile.push(cs.position);
    }
    return { stable, fragile, critical };
}

function computeAgeCurve(players: RichRosterPlayer[]): { young: number; prime: number; aging: number } {
    let young = 0, prime = 0, aging = 0;
    const skillPlayers = players.filter(p => ['QB', 'RB', 'WR', 'TE'].includes(normalizePosition(p.position)));
    for (const p of skillPlayers) {
        const pos = normalizePosition(p.position);
        const age = p.age ?? 26;
        const yng = AGE_YOUNG[pos] ?? 24;
        const agn = AGE_AGING[pos] ?? 30;
        if (age <= yng) young++;
        else if (age >= agn) aging++;
        else prime++;
    }
    return { young, prime, aging };
}

// v3.3: clamp to [0%, +10%] unless draft was catastrophic (avgScore < 8/25)
function computeWinProbDelta(picks: PickAlignment[], totalTeams: number, avgScore: number): number {
    if (picks.length === 0) return 0;
    const totalVop = picks.reduce((s, p) => s + p.vop, 0);
    const avgVop   = totalVop / picks.length;
    const raw      = (avgVop / 100) * 20 * (12 / Math.max(8, totalTeams));
    const rounded  = Math.round(raw * 10) / 10;
    // Only allow negative impact if alignment was catastrophic
    if (avgScore < 8) return rounded;
    return Math.min(10, Math.max(0, rounded));
}

// ── Dynasty Outlook v3.3 ──────────────────────────────────────────────────────
// Tone: positive anchor → directional clarity → 1-2 actionable insights → momentum

function generateDynastyOutlook(
    traj: TrajectoryWindow,
    horizonYears: number,
    tierDist: TierDistribution,
    coreStrength: PositionCoreScore[],
    ageCurve: { young: number; prime: number; aging: number },
    avgScore: number,
): string {
    const strongPositions = coreStrength.filter(cs => cs.grade === 'A' || cs.grade === 'B').map(cs => cs.position);
    const weakPositions   = coreStrength.filter(cs => cs.grade === 'D' || cs.grade === 'F').map(cs => cs.position);
    const elite = tierDist.T1 + tierDist.T2;

    // Positive anchor — what the draft added
    const draftAnchor =
        elite >= 3         ? `Your draft added ${elite} T1/T2 playmakers` :
        tierDist.T2 >= 2   ? `Your draft strengthened your core with ${tierDist.T2} T2 players` :
        tierDist.T3 >= 2   ? `Your draft added depth and developmental upside` :
        `Your draft addressed key roster needs`;

    // Age narrative
    const ageNarrative =
        ageCurve.young >= 3 ? 'a young, dynamic core with room to grow' :
        ageCurve.aging >= 3 ? 'a proven, experienced core entering its peak' :
        'a balanced roster mix';

    // Draft quality signal
    const draftSignal =
        avgScore >= 19 ? 'perfectly aligned with your long-term window' :
        avgScore >= 15 ? 'directionally aligned with your build' :
        'with some picks that open up new options going forward';

    // Strength + gap note
    const posStrength = strongPositions.length > 0
        ? `Your ${strongPositions.join(' and ')} corps are built to compete`
        : 'your roster balance is improving across all positions';

    const actionNote = weakPositions.length > 0
        ? ` Targeting ${weakPositions.join(' and ')} depth in the next window will accelerate your timeline.`
        : '';

    // Trajectory-specific momentum close
    const momentum =
        traj === 'WIN_NOW'   ? `Push the window now — the pieces are there.` :
        traj === 'ASCENDING' ? `You're on track to be a serious contender within ${horizonYears} years.` :
        traj === 'REBUILD'   ? `Stay patient and keep stacking. The upside is real.` :
        `Monitor your window closely — one or two additions could shift your trajectory.`;

    return `${draftAnchor}, built around ${ageNarrative}, ${draftSignal}. ${posStrength}.${actionNote} ${momentum}`;
}

// ── Draft Identity v3.3 ───────────────────────────────────────────────────────

function draftIdentity(profile: DraftProfile, avgScore: number, classStrength: ClassStrength): string {
    const mode = resolveEffectiveMode(profile);
    const traj = profile.trajectoryWindow;

    if (mode === 'WIN_NOW' && (traj === 'WIN_NOW' || traj === 'PLATEAU') && avgScore >= 19)
        return 'You drafted aggressively for your contention window — the pieces fit.';
    if (mode === 'WIN_NOW' && avgScore >= 15)
        return 'You drafted with a WIN‑NOW lean and added immediate contributors.';
    if (mode === 'REBUILD' && (traj === 'REBUILD' || traj === 'ASCENDING') && avgScore >= 19)
        return 'You drafted ceiling-first — patience and upside over short-term production.';
    if (mode === 'REBUILD' && avgScore >= 15)
        return 'You prioritized future value and stacked the talent pipeline.';
    if (avgScore >= 19 && classStrength === 'strong')
        return 'You navigated a deep class and extracted real value at every slot.';
    if (avgScore >= 19)
        return 'You drafted with sharp alignment — value and need working together.';
    if (avgScore >= 15)
        return 'You built a balanced roster with a clear direction.';
    return 'Your draft addressed multiple needs — a few adjustments would sharpen the alignment.';
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface MyPickInput {
    pickOverall:     number;
    round:           number;
    pickInRound:     number;
    sleeperPlayerId: string;
}

export interface AllPickInput {
    pickOverall: number;
    playerId:    string;
}

export interface ReportCardInput {
    myPicks:         MyPickInput[];
    allPicks:        AllPickInput[];   // all teams, all picks, sorted by pickOverall
    pool:            PoolPlayer[];     // full draft pool sorted by fiqScore desc (rank = index+1)
    rosterFull:      { position: string }[];
    rosterRich:      RichRosterPlayer[];
    draftProfile:    DraftProfile;
    totalTeams:      number;
    totalRounds:     number;
    trajectoryData?: {
        window:       string;
        horizonYears: number;
        overallScore: number;
    } | null;
}

export function computeReportCard(input: ReportCardInput): DraftReportCard {
    const {
        myPicks, allPicks, pool, rosterFull, rosterRich,
        draftProfile, totalTeams, totalRounds, trajectoryData,
    } = input;

    const totalPicksInDraft = totalTeams * totalRounds;
    const effectiveMode     = resolveEffectiveMode(draftProfile);
    const traj              = draftProfile.trajectoryWindow;

    // Class strength — scales VOP tier values
    const classStrength = computeClassStrength(pool);
    const TIER_VALUES   = tierValuesForClass(classStrength);

    // Build player lookup by sleeperPlayerId
    const playerBySlId = new Map(pool.map(p => [p.sleeperPlayerId, p]));

    // Pool-relative ADP rank (pool sorted by fiqScore desc → rank = index + 1)
    const poolRankBySlId = new Map(pool.map((p, i) => [p.sleeperPlayerId, i + 1]));

    // Pre-draft roster position counts
    const preDraftCounts: Record<string, number> = {};
    for (const p of rosterFull) {
        const pos = normalizePosition(p.position);
        preDraftCounts[pos] = (preDraftCounts[pos] ?? 0) + 1;
    }
    const TARGET: Record<string, number> = { QB: 2, RB: 5, WR: 7, TE: 2 };

    const sortedAllPicks = [...allPicks].sort((a, b) => a.pickOverall - b.pickOverall);

    const picks: PickAlignment[]  = [];
    let myTierDist = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };

    for (const mp of myPicks) {
        const draftedBefore = new Set(
            sortedAllPicks
                .filter(p => p.pickOverall < mp.pickOverall)
                .map(p => p.playerId)
        );

        const available     = pool.filter(p => !draftedBefore.has(p.sleeperPlayerId));
        const bpaTierAtPick = available[0]?.tier ?? null;
        const bpaFiqAtPick  = available[0]?.fiqScore ?? null;

        const player = playerBySlId.get(mp.sleeperPlayerId) ?? available.find(p => p.sleeperPlayerId === mp.sleeperPlayerId);
        if (!player) continue;

        const pos     = normalizePosition(player.position);
        const deficit = Math.max(0, (TARGET[pos] ?? 0) - (preDraftCounts[pos] ?? 0));
        const fills   = deficit > 0;

        // VOP — blends class-adjusted tier value with pool ADP delta (30%)
        const expectedVal  = 90 - (mp.pickOverall / totalPicksInDraft) * 50;
        const tierVal      = TIER_VALUES[player.tier] ?? 40;
        const tierVop      = tierVal - expectedVal;
        const poolRank     = poolRankBySlId.get(mp.sleeperPlayerId);
        const poolADPDelta = poolRank != null ? mp.pickOverall - poolRank : null;
        const vop          = Math.round(
            poolADPDelta != null
                ? 0.7 * tierVop + 0.3 * poolADPDelta
                : tierVop
        );

        // Alignment components
        const tf  = tierFitScore(player.tier, bpaTierAtPick ?? player.tier);
        const mf  = modeFitScore(player.tier, player.opportunityScore, player.age, effectiveMode);
        const trj = trajectoryFitScore(player.tier, player.opportunityScore, player.age, traj, draftProfile.horizonYears, fills);
        const nf  = needFitScore(deficit, fills);
        const of_ = opportunityFitScore(player.opportunityScore, traj);
        const total = tf + mf + trj + nf + of_;

        const alignmentNoNote = {
            pickOverall:     mp.pickOverall,
            round:           mp.round,
            pickInRound:     mp.pickInRound,
            sleeperPlayerId: mp.sleeperPlayerId,
            playerName:      player.playerName,
            position:        player.position,
            team:            player.team,
            age:             player.age,
            tier:            player.tier,
            fiqScore:        player.fiqScore,
            opportunityScore: player.opportunityScore ?? null,
            bpaTierAtPick,
            bpaFiqAtPick,
            vop,
            tierFit:         tf,
            modeFit:         mf,
            trajectoryFit:   trj,
            needFit:         nf,
            opportunityFit:  of_,
            totalScore:      total,
            grade:           gradeFromScore(total),
        };

        picks.push({ ...alignmentNoNote, gradeNote: gradeNote(alignmentNoNote) });

        const key = `T${player.tier}` as keyof typeof myTierDist;
        myTierDist[key] = (myTierDist[key] ?? 0) + 1;
        preDraftCounts[pos] = (preDraftCounts[pos] ?? 0) + 1;
    }

    const avgScore = picks.length > 0
        ? Math.round(picks.reduce((s, p) => s + p.totalScore, 0) / picks.length)
        : 0;

    const leagueAvg = computeLeagueAvgTiers(
        allPicks.map(p => ({ player_id: p.playerId })),
        pool,
        totalTeams,
    );

    const tierDistribution: TierDistribution = { ...myTierDist, leagueAvg };
    const draftStrategy = computeDraftStrategy(myTierDist);
    const totalVop      = Math.round(picks.reduce((s, p) => s + p.vop, 0));
    const identity      = draftIdentity(draftProfile, avgScore, classStrength);

    // Franchise state
    const coreStrength      = computeCoreStrength(rosterRich);
    const positionStability = computePositionStability(rosterRich, coreStrength);
    const ageCurve          = computeAgeCurve(rosterRich);

    // v3.3 trajectory: if engine returns PLATEAU (or no data), override with
    // age-curve rules to guarantee meaningful distribution across the league.
    const rawTrajWindow = (trajectoryData?.window ?? traj) as TrajectoryWindow;
    const franchiseTraj: TrajectoryWindow =
        rawTrajWindow === 'PLATEAU'
            ? deriveTrajectoryFromRoster(trajectoryData?.overallScore ?? 50, ageCurve)
            : rawTrajWindow;

    const winProbDelta  = computeWinProbDelta(picks, totalTeams, avgScore);
    const dynastyOutlook = generateDynastyOutlook(
        franchiseTraj,
        trajectoryData?.horizonYears ?? draftProfile.horizonYears,
        tierDistribution,
        coreStrength,
        ageCurve,
        avgScore,
    );

    const franchise: FranchiseState = {
        trajectoryWindow:    franchiseTraj,
        horizonYears:        trajectoryData?.horizonYears ?? draftProfile.horizonYears,
        overallScore:        trajectoryData?.overallScore ?? 50,
        coreStrength,
        positionStability,
        ageCurve,
        winProbabilityDelta: winProbDelta,
        dynastyOutlook,
    };

    return {
        picks,
        identity,
        identityGrade: gradeFromScore(avgScore),
        avgScore,
        tierDistribution,
        classStrength,
        draftStrategy,
        totalVop,
        franchise,
        draftProfile,
    };
}
