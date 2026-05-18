// FantasyiQ Trust — FiQ Draft Report Card Engine
// Post-draft audit: did you draft according to your Effective Mode and Trajectory?

import type { DraftProfile, TrajectoryWindow } from './context';
import { normalizePosition } from './context';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PickGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

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
    vop:             number;         // value over pick slot
    tierFit:         number;         // 0–5
    modeFit:         number;         // 0–5
    trajectoryFit:   number;         // 0–5
    needFit:         number;         // 0–5
    opportunityFit:  number;         // 0–5
    totalScore:      number;         // 0–25
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
    label:    string;  // e.g. "QB Core"
}

export interface FranchiseState {
    trajectoryWindow:  string;
    horizonYears:      number;
    overallScore:      number;
    coreStrength:      PositionCoreScore[];
    positionStability: { stable: string[]; fragile: string[]; critical: string[] };
    ageCurve:          { young: number; prime: number; aging: number };
    winProbabilityDelta: number;
    dynastyOutlook:    string;
}

export interface DraftReportCard {
    picks:            PickAlignment[];
    identity:         string;
    identityGrade:    PickGrade;
    avgScore:         number;
    tierDistribution: TierDistribution;
    totalVop:         number;
    franchise:        FranchiseState;
    draftProfile:     DraftProfile;
}

// ── Player pool entry (shared type for both draft types) ──────────────────────

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

const TIER_VALUES: Record<number, number> = { 1: 95, 2: 82, 3: 68, 4: 55, 5: 40 };

function gradeFromScore(score: number): PickGrade {
    if (score >= 24) return 'A+';
    if (score >= 22) return 'A';
    if (score >= 19) return 'B';
    if (score >= 16) return 'C';
    if (score >= 13) return 'D';
    return 'F';
}

function posGrade(avgFiq: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (avgFiq >= 80) return 'A';
    if (avgFiq >= 70) return 'B';
    if (avgFiq >= 60) return 'C';
    if (avgFiq >= 50) return 'D';
    return 'F';
}

// ── Per-component alignment scores ────────────────────────────────────────────

function tierFitScore(playerTier: number, bpaTier: number): number {
    const gap = playerTier - bpaTier;
    if (gap <= 0) return 5;   // matched or exceeded BPA
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
        if (o >= 70) return 3;    // fine but ceiling > role for ascending
        if (o >= 50) return 4;
        return 3;
    }
    if (traj === 'REBUILD') {
        if (o == null) return 4;   // correct — don't need a year-1 role
        if (o >= 70) return 2;     // year-1 role misaligned with rebuild
        return 3;
    }
    // PLATEAU
    if (o == null) return 3;
    if (o >= 70) return 4;
    if (o >= 50) return 3;
    return 2;
}

// ── Grade note generator ──────────────────────────────────────────────────────

function gradeNote(pick: Omit<PickAlignment, 'gradeNote' | 'grade'>): string {
    const parts: string[] = [];
    const { tierFit, modeFit, trajectoryFit, needFit, opportunityFit } = pick;
    const top = Math.max(tierFit, modeFit, trajectoryFit);

    if (tierFit === 5) parts.push(`Matched BPA at T${pick.tier}`);
    else if (tierFit <= 2) parts.push(`T${pick.tier} pick — T${pick.bpaTierAtPick ?? '?'} was available`);

    if (modeFit >= 4 && pick.tier <= 2) parts.push('Strong mode fit');
    if (opportunityFit === 5) parts.push('High year-1 role — fits window');
    if (opportunityFit === 2 && pick.opportunityScore != null && pick.opportunityScore >= 70)
        parts.push('High role profile misaligned with rebuild');
    if (trajectoryFit >= 4 && pick.age != null && pick.age <= 23) parts.push(`Age ${pick.age} — young T${pick.tier} fits trajectory`);
    if (needFit >= 4) parts.push(`Fills ${pick.position} need`);
    if (pick.vop > 5) parts.push(`+${Math.round(pick.vop)} VOP`);
    else if (pick.vop < -10) parts.push(`Reach (${Math.round(pick.vop)} VOP)`);

    if (parts.length === 0) {
        if (top >= 4) parts.push('Good pick for your context');
        else parts.push('Marginal alignment with your draft profile');
    }

    return parts.slice(0, 2).join(', ') + '.';
}

// ── Resolve effective mode ────────────────────────────────────────────────────
// Must match the same guardrail logic used in scoring.ts

function resolveEffectiveMode(profile: DraftProfile): DraftProfile['teamMode'] {
    const { teamMode, trajectoryWindow } = profile;
    if (teamMode === 'WIN_NOW' && (trajectoryWindow === 'WIN_NOW' || trajectoryWindow === 'PLATEAU')) return 'WIN_NOW';
    if (teamMode === 'REBUILD' && (trajectoryWindow === 'REBUILD' || trajectoryWindow === 'ASCENDING')) return 'REBUILD';
    if (teamMode === 'WIN_NOW' && trajectoryWindow === 'REBUILD') return 'BALANCED';
    if (teamMode === 'REBUILD' && trajectoryWindow === 'WIN_NOW') return 'BALANCED';
    return 'BALANCED';
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
        if (cs.grade === 'A' || cs.grade === 'B' && filled) stable.push(cs.position);
        else if (cs.grade === 'F' || !filled && cs.count === 0) critical.push(cs.position);
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

function computeWinProbDelta(picks: PickAlignment[], totalTeams: number): number {
    if (picks.length === 0) return 0;
    const totalVop = picks.reduce((s, p) => s + p.vop, 0);
    const avgVop   = totalVop / picks.length;
    // Normalize: +100 VOP avg → ~20% improvement estimate, scaled by teams
    const raw = (avgVop / 100) * 20 * (12 / Math.max(8, totalTeams));
    return Math.round(raw * 10) / 10;
}

function generateDynastyOutlook(
    traj: TrajectoryWindow,
    horizonYears: number,
    tierDist: TierDistribution,
    coreStrength: PositionCoreScore[],
    ageCurve: { young: number; prime: number; aging: number },
    avgScore: number,
): string {
    const windowLabel =
        traj === 'WIN_NOW'   ? 'a WIN‑NOW 1-year window' :
        traj === 'ASCENDING' ? `an ASCENDING ${horizonYears}-year window` :
        traj === 'REBUILD'   ? `a REBUILD ${horizonYears}+ year build` :
        'a PLATEAU phase';

    const draftQuality =
        tierDist.T1 + tierDist.T2 >= 3 ? `${tierDist.T1 + tierDist.T2} T1/T2 players` :
        tierDist.T2 >= 2               ? `${tierDist.T2} T2 players`                   :
        tierDist.T3 >= 2               ? `solid T3 depth`                               :
        'mixed value picks';

    const strongPositions = coreStrength.filter(cs => cs.grade === 'A' || cs.grade === 'B').map(cs => cs.position);
    const weakPositions   = coreStrength.filter(cs => cs.grade === 'D' || cs.grade === 'F').map(cs => cs.position);

    const posStrength = strongPositions.length > 0
        ? `Your ${strongPositions.join(' and ')} corps are strengths`
        : 'roster balance is improving';

    const ageNarrative = ageCurve.young >= 3
        ? 'a young core with significant upside'
        : ageCurve.aging >= 3
        ? 'an experienced core entering its peak'
        : 'a balanced age mix';

    const outlook =
        traj === 'WIN_NOW'   ? 'You are positioned to contend immediately. Push your chips in.' :
        traj === 'ASCENDING' ? `You are positioned to be a serious threat within ${horizonYears} years.` :
        traj === 'REBUILD'   ? 'Patience will reward this roster. Keep stacking talent.' :
        'Monitor your competitive window closely over the next 1–2 seasons.';

    const draftGrade = avgScore >= 21 ? 'a strong draft class' : avgScore >= 17 ? 'a solid draft class' : 'a draft class that needed more alignment';

    const weakNote = weakPositions.length > 0
        ? ` ${weakPositions.join(' and ')} remain areas to address.`
        : '';

    return `Your roster is entering ${windowLabel}. Your draft added ${draftQuality} in ${draftGrade}, built around ${ageNarrative}. ${posStrength}.${weakNote} ${outlook}`;
}

function draftIdentity(profile: DraftProfile, avgScore: number): string {
    const mode = resolveEffectiveMode(profile);
    const traj = profile.trajectoryWindow;

    if (mode === 'WIN_NOW' && (traj === 'WIN_NOW' || traj === 'PLATEAU') && avgScore >= 19)
        return 'You drafted like an Aggressive WIN‑NOW team.';
    if (mode === 'WIN_NOW' && avgScore >= 16)
        return 'You drafted with a WIN‑NOW lean, though some picks strayed from your window.';
    if (mode === 'REBUILD' && (traj === 'REBUILD' || traj === 'ASCENDING') && avgScore >= 19)
        return 'You drafted like a Deep REBUILD team — ceiling first.';
    if (mode === 'REBUILD' && avgScore >= 16)
        return 'You drafted with a REBUILD lean, prioritizing future value.';
    if (avgScore >= 21)
        return 'You drafted like a BALANCED team optimizing value at every pick.';
    if (avgScore >= 17)
        return 'You drafted a BALANCED roster, mixing value and positional need.';
    return 'Your draft was mixed — some picks aligned with your profile, others diverged.';
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
    rosterFull:      { position: string }[];           // existing roster before draft
    rosterRich:      RichRosterPlayer[];               // post-draft roster with fiqScores
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

    // Build player lookup by sleeperPlayerId
    const playerBySlId = new Map(pool.map(p => [p.sleeperPlayerId, p]));

    // Pool-relative ADP rank (pool is sorted by fiqScore desc, so rank = index + 1)
    const poolRankBySlId = new Map(pool.map((p, i) => [p.sleeperPlayerId, i + 1]));

    // Build roster position counts from EXISTING roster (pre-draft)
    const preDraftCounts: Record<string, number> = {};
    for (const p of rosterFull) {
        const pos = normalizePosition(p.position);
        preDraftCounts[pos] = (preDraftCounts[pos] ?? 0) + 1;
    }
    const TARGET: Record<string, number> = {
        QB: draftProfile.teamMode === 'WIN_NOW' ? 2 : 2,
        RB: 5, WR: 7, TE: 2,
    };

    // Sort allPicks by pickOverall
    const sortedAllPicks = [...allPicks].sort((a, b) => a.pickOverall - b.pickOverall);

    // Compute per-pick alignment
    const picks: PickAlignment[] = [];
    let   myTierDist = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };

    for (const mp of myPicks) {
        // Players drafted before this pick
        const draftedBefore = new Set(
            sortedAllPicks
                .filter(p => p.pickOverall < mp.pickOverall)
                .map(p => p.playerId)
        );

        // Available pool at this pick
        const available = pool.filter(p => !draftedBefore.has(p.sleeperPlayerId));
        const bpaTierAtPick = available[0]?.tier ?? null;

        const player = playerBySlId.get(mp.sleeperPlayerId) ?? available.find(p => p.sleeperPlayerId === mp.sleeperPlayerId);
        if (!player) continue;

        const pos     = normalizePosition(player.position);
        const deficit = Math.max(0, (TARGET[pos] ?? 0) - (preDraftCounts[pos] ?? 0));
        const fills   = deficit > 0;

        // VOP — blends tier-based value with pool ADP delta (soft 30% weight)
        const expectedVal    = 90 - (mp.pickOverall / totalPicksInDraft) * 50;
        const tierVal        = TIER_VALUES[player.tier] ?? 40;
        const tierVop        = tierVal - expectedVal;
        const poolRank       = poolRankBySlId.get(mp.sleeperPlayerId);
        const poolADPDelta   = poolRank != null ? mp.pickOverall - poolRank : null;
        const vop            = Math.round(
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

        // Update pre-draft counts so subsequent picks see the updated need
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
    const totalVop  = Math.round(picks.reduce((s, p) => s + p.vop, 0));
    const identity  = draftIdentity(draftProfile, avgScore);

    // Franchise state
    const coreStrength     = computeCoreStrength(rosterRich);
    const positionStability = computePositionStability(rosterRich, coreStrength);
    const ageCurve         = computeAgeCurve(rosterRich);
    const winProbDelta     = computeWinProbDelta(picks, totalTeams);
    const dynastyOutlook   = generateDynastyOutlook(
        (trajectoryData?.window ?? traj) as TrajectoryWindow,
        trajectoryData?.horizonYears ?? draftProfile.horizonYears,
        tierDistribution,
        coreStrength,
        ageCurve,
        avgScore,
    );

    const franchise: FranchiseState = {
        trajectoryWindow:    trajectoryData?.window ?? traj,
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
        totalVop,
        franchise,
        draftProfile,
    };
}
