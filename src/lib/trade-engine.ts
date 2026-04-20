// FantasyiQ Trust — Dynamic Trade Value Engine
// Formula: BaseValue × WeightedFactors (7 factors summing to 1.0)
// Trade Score: 0–100 scale based on DTV differential
// Dynasty vs Redraft use distinct weight sets

import { getPlayerIntel, ageCurveDynasty } from './player-intelligence';
export type { ContractTier } from './player-intelligence';

export interface Player {
    rank:             number;
    name:             string;
    position:         string;
    team:             string;
    age:              number;
    baseValue:        number;
    injuryStatus?:    string | null;
    birthDate?:       string | null;  // ISO date from Sleeper — used for runtime age display
    playerImageUrl?:  string | null;  // Sleeper CDN headshot URL
}

export interface DtvResult extends Player {
    posMultiplier:  number;
    ageMultiplier:  number;
    perfFactor:     number;
    schedFactor:    number;   // = schemeFit
    injuryFactor:   number;
    situFactor:     number;   // = contractFactor
    draftCapFactor: number;   // NEW: draft pedigree weight
    rawDtv:         number;
    pprBoost:       number;
    finalDtv:       number;
    tier:           string;
    insights:       string[]; // NEW: badge labels
}

export type PprFormat = 0 | 0.5 | 1 | 'te_prem';
export type LeagueType = 'Redraft' | 'Dynasty';

// Dynasty weights: age & contract matter far more
const DYNASTY_WEIGHTS = {
    posScarcity:    0.20,
    ageCurve:       0.22,
    recentPerf:     0.15,
    schemeFit:      0.15,
    contractFactor: 0.12,
    draftCapital:   0.08,
    injuryRisk:     0.08,
};

// Redraft weights: current production & scheme usage dominate
const REDRAFT_WEIGHTS = {
    posScarcity:    0.28,
    ageCurve:       0.06,
    recentPerf:     0.25,
    schemeFit:      0.18,
    contractFactor: 0.04,
    draftCapital:   0.03,
    injuryRisk:     0.16,
};

// Encapsulates all league-specific settings that affect player values.
// Built from Sleeper roster_positions + scoring_settings on the league page;
// defaults match a standard 12-team, 1QB, 2RB/2WR/1TE/1FLEX, 4pt-TD setup.
export interface LeagueSettings {
    // Scoring
    passTd:     number;   // passing TD value (4 or 6) — boosts QB scarcity
    bonusRecTe: number;   // bonus pts per TE reception — boosts TE ppr value
    // Roster starter slot counts (from roster_positions)
    qbSlots:   number;
    rbSlots:   number;
    wrSlots:   number;
    teSlots:   number;
    flexSlots: number;    // FLEX = RB/WR/TE eligible
    sfSlots:   number;    // SUPER_FLEX = QB/RB/WR/TE eligible
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
    passTd: 4, bonusRecTe: 0,
    qbSlots: 1, rbSlots: 2, wrSlots: 2, teSlots: 1, flexSlots: 1, sfSlots: 0,
};

// KTC assumes a standard 1QB PPR format — these are the baseline slot counts
// that KTC values are calibrated against.
const KTC_BASE_SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SF: 0 };

// Returns a scarcity multiplier relative to what KTC already prices in.
// Each slot above/below the KTC baseline shifts value ±6% per slot.
// FLEX and SF slots count at 40% weight toward RB/WR demand,
// and SF adds to QB demand at 65% (a SF start often goes to a QB).
function computeScarcity(pos: string, s: LeagueSettings): number {
    // 0.10 per slot produces visible differentiation between league formats.
    // FLEX is split 40/40/20 across RB/WR/TE; SF contributes 65% to QB demand.
    const K = 0.10;
    switch (pos) {
        case 'QB': {
            const leagueDemand = s.qbSlots + s.sfSlots * 0.65;
            const baseDemand   = KTC_BASE_SLOTS.QB + KTC_BASE_SLOTS.SF * 0.65;
            return 1.0 + (leagueDemand - baseDemand) * K;
        }
        case 'RB': {
            const leagueDemand = s.rbSlots + s.flexSlots * 0.40;
            const baseDemand   = KTC_BASE_SLOTS.RB + KTC_BASE_SLOTS.FLEX * 0.40;
            return 1.0 + (leagueDemand - baseDemand) * K;
        }
        case 'WR': {
            const leagueDemand = s.wrSlots + s.flexSlots * 0.40;
            const baseDemand   = KTC_BASE_SLOTS.WR + KTC_BASE_SLOTS.FLEX * 0.40;
            return 1.0 + (leagueDemand - baseDemand) * K;
        }
        case 'TE': {
            const leagueDemand = s.teSlots + s.flexSlots * 0.20;
            const baseDemand   = KTC_BASE_SLOTS.TE + KTC_BASE_SLOTS.FLEX * 0.20;
            return 1.0 + (leagueDemand - baseDemand) * K;
        }
        default: return 1.0;
    }
}

const CATCH_RATE: Record<string, number> = {
    RB:   0.5,
    WR:   1.0,
    TE:   0.8,
    QB:   0,
    K:    0,
    DEF:  0,
    PICK: 0,
};

// Age multiplier is now handled by getPlayerIntel's ageFactor (per-position curves)

function tier(finalDtv: number): string {
    if (finalDtv >= 85) return 'Elite';
    if (finalDtv >= 70) return 'Star';
    if (finalDtv >= 55) return 'Starter';
    if (finalDtv >= 40) return 'Flex';
    if (finalDtv >= 25) return 'Bench';
    return 'Waiver';
}

// Injury risk → DTV discount. Only current status is used; historical games-missed
// data can be wired in later when available per-season.
// TODO: add historical component when per-season games-missed data is available.
const INJURY_STATUS_RISK: Record<string, number> = {
    'Questionable': 0.10,
    'Doubtful':     0.20,
    'Out':          0.30,
    'IR':           0.40,
    'PUP':          0.35,
    'Sus':          0.15,
};

function calcInjuryFactor(status: string | null | undefined): number {
    if (!status || status === 'Active') return 1.0;
    const riskScore = Math.min(1.0, INJURY_STATUS_RISK[status] ?? 0.0);
    // Higher risk = lower multiplier (max 15% discount at riskScore = 1.0)
    return Math.round((1.0 - riskScore * 0.15) * 100) / 100;
}

export interface PlayerFactors {
    perfFactor:   number;
    schedFactor:  number;
    injuryFactor: number;
    situFactor:   number;
}

const DEFAULT_FACTORS: PlayerFactors = {
    perfFactor:   1.0,
    schedFactor:  1.0,
    injuryFactor: 1.0,
    situFactor:   1.0,
};

export function calcDtv(
    player: Player,
    _ppr: PprFormat = 1,
    leagueType: LeagueType = 'Redraft',
    _factors?: PlayerFactors,
    settings: LeagueSettings = DEFAULT_LEAGUE_SETTINGS,
): DtvResult {
    const intel         = getPlayerIntel(player.name, player.position, player.team, player.age, leagueType);
    const isPick        = player.position === 'PICK';
    const posMultiplier = isPick ? 1 : computeScarcity(player.position, settings);
    const injuryFactor  = isPick ? 1 : calcInjuryFactor(player.injuryStatus);
    const ageMultiplier = (leagueType === 'Dynasty' && !isPick)
        ? ageCurveDynasty(player.position, player.age)
        : 1;
    const rawDtv        = Math.round(player.baseValue * 10) / 10;
    const finalDtv      = Math.round(rawDtv * posMultiplier * injuryFactor * ageMultiplier * 10) / 10;

    return {
        ...player,
        posMultiplier,
        ageMultiplier,
        perfFactor:     1,
        schedFactor:    1,
        injuryFactor,
        situFactor:     1,
        draftCapFactor: 1,
        rawDtv,
        pprBoost:       0,
        finalDtv,
        tier:           tier(finalDtv),
        insights:       intel.insights,
    };
}

function tradeScore(totalA: number, totalB: number): number {
    if (totalA === 0 && totalB === 0) return 50;
    // Net DTV differential from Team A's perspective (Team A gives totalA, receives totalB)
    const netDiff = totalB - totalA;
    const rawScore = 50 + (netDiff * 1.67);
    return Math.min(100, Math.max(0, Math.round(rawScore)));
}

function verdict(score: number): string {
    if (score >= 90) return 'Slam Dunk';
    if (score >= 75) return 'Strong Win';
    if (score >= 56) return 'Slight Edge';
    if (score >= 45) return 'Fair Trade';
    if (score >= 30) return 'Slight Loss';
    if (score >= 15) return 'Bad Deal';
    return 'Robbery';
}

export function evaluateTrade(
    sideA: Player[],
    sideB: Player[],
    ppr: PprFormat = 1,
    leagueType: LeagueType = 'Redraft',
    factorsA: PlayerFactors[] = [],
    factorsB: PlayerFactors[] = [],
    settings: LeagueSettings = DEFAULT_LEAGUE_SETTINGS,
): {
    sideA:   DtvResult[];
    sideB:   DtvResult[];
    totalA:  number;
    totalB:  number;
    diff:    number;
    score:   number;
    verdict: string;
    winner:  'A' | 'B' | 'Even';
} {
    const a = sideA.map((p, i) => calcDtv(p, ppr, leagueType, factorsA[i] ?? DEFAULT_FACTORS, settings));
    const b = sideB.map((p, i) => calcDtv(p, ppr, leagueType, factorsB[i] ?? DEFAULT_FACTORS, settings));
    const totalA = Math.round(a.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
    const totalB = Math.round(b.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
    const diff   = Math.round(Math.abs(totalA - totalB) * 10) / 10;
    const score  = tradeScore(totalA, totalB);
    const winner: 'A' | 'B' | 'Even' = score >= 55 ? 'A' : score <= 45 ? 'B' : 'Even';
    return { sideA: a, sideB: b, totalA, totalB, diff, score, verdict: verdict(score), winner };
}
const ROUND_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
export function roundOrdinal(round: number): string {
    return ROUND_ORDINALS[round - 1] ?? `${round}th`;
}

// Tier picks: Early ≈ pick 1/6 of the way through, Mid = midpoint, Late = 5/6
const TIER_ENTRIES: { tier: string; t: number }[] = [
    { tier: 'Early', t: 1 / 6 },
    { tier: 'Mid',   t: 1 / 2 },
    { tier: 'Late',  t: 5 / 6 },
];

// Round value ranges: [pickOneValue, lastPickValue] for the nearest draft year (anchor)
const ROUND_ANCHORS: [number, number][] = [
    [82, 52], // Round 1
    [46, 32], // Round 2
    [26, 18], // Round 3
    [16, 10], // Round 4
    [10,  6], // Round 5
];

const YEAR_DISCOUNTS = [1.00, 0.83, 0.69]; // nearest, +1, +2 year multipliers

// NFL draft is typically ~April 24. Before that date 2026 picks still trade freely;
// after that they've been used so futures start at 2027.
function futurePickYears(): [number, number, number] {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1; // 1-based
    const day   = now.getDate();
    const pastDraft = month > 4 || (month === 4 && day >= 25);
    const base  = pastDraft ? year + 1 : year;
    return [base, base + 1, base + 2];
}

// Generates individual draft picks (1.01 … {rounds}.{leagueSize}) for the next 3 draft years.
// Age is kept at 22 for dynasty age-curve logic; it is not shown in the UI.
export function getDraftPicks(leagueSize: number, draftRounds = 5): Player[] {
    const picks: Player[] = [];
    let rank = 500;

    for (const [i, year] of futurePickYears().entries()) {
        const discount = YEAR_DISCOUNTS[i] ?? 0.60;
        for (let round = 1; round <= draftRounds; round++) {
            const [hi, lo] = ROUND_ANCHORS[round - 1] ?? [6, 3]; // rounds beyond 5 get minimal value
            for (let pick = 1; pick <= leagueSize; pick++) {
                const t = leagueSize === 1 ? 0 : (pick - 1) / (leagueSize - 1);
                const value = Math.round((hi + t * (lo - hi)) * discount * 10) / 10;
                const pickStr = pick.toString().padStart(2, '0');
                picks.push({
                    rank: rank++,
                    name: `${year} ${round}.${pickStr}`,
                    position: 'PICK',
                    team: String(year),
                    age: 23,
                    baseValue: value,
                });
            }
            // Tier picks — used when exact draft order is not yet set
            for (const { tier, t } of TIER_ENTRIES) {
                const value = Math.round((hi + t * (lo - hi)) * discount * 10) / 10;
                picks.push({
                    rank: rank++,
                    name: `${year} Round ${round} ${tier} ${roundOrdinal(round)}`,  // e.g. "2027 Round 1 Early 1st"
                    position: 'PICK',
                    team: String(year),
                    age: 23,
                    baseValue: value,
                });
            }
        }
    }

    return picks;
}
