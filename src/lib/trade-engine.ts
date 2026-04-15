// FantasyIQ Trust — Dynamic Trade Value Engine
// Formula: BaseValue × WeightedFactors (7 factors summing to 1.0)
// Trade Score: 0–100 scale based on DTV differential
// Dynasty vs Redraft use distinct weight sets

import { getPlayerIntel } from './player-intelligence';
export type { ContractTier } from './player-intelligence';

export interface Player {
    rank:          number;
    name:          string;
    position:      string;
    team:          string;
    age:           number;
    baseValue:     number;
    injuryStatus?: string | null;
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
    const rawDtv        = Math.round(player.baseValue * 10) / 10;
    const finalDtv      = Math.round(rawDtv * posMultiplier * injuryFactor * 10) / 10;

    return {
        ...player,
        posMultiplier,
        ageMultiplier:  1,
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

// Top 300 NFL Fantasy Players — 2025 season base values (0–100 scale)
export const PLAYERS: Player[] = [
    // ── TOP 60 (from trade chart) ────────────────────────────────────────────
    { rank:  1, name: "Ja'Marr Chase",        position: 'WR',  team: 'CIN', age: 26, baseValue: 97 },
    { rank:  2, name: 'Bijan Robinson',        position: 'RB',  team: 'ATL', age: 24, baseValue: 96 },
    { rank:  3, name: 'Josh Allen',            position: 'QB',  team: 'BUF', age: 31, baseValue: 95 },
    { rank:  4, name: 'CeeDee Lamb',           position: 'WR',  team: 'DAL', age: 27, baseValue: 95 },
    { rank:  5, name: 'Breece Hall',           position: 'RB',  team: 'NYJ', age: 25, baseValue: 93 },
    { rank:  6, name: 'Lamar Jackson',         position: 'QB',  team: 'BAL', age: 30, baseValue: 93 },
    { rank:  7, name: 'Jahmyr Gibbs',          position: 'RB',  team: 'DET', age: 24, baseValue: 92 },
    { rank:  8, name: 'Tyreek Hill',           position: 'WR',  team: 'FA',  age: 33, baseValue: 83 },
    { rank:  9, name: 'Amon-Ra St. Brown',     position: 'WR',  team: 'DET', age: 26, baseValue: 91 },
    { rank: 10, name: 'Saquon Barkley',        position: 'RB',  team: 'PHI', age: 29, baseValue: 90 },
    { rank: 11, name: 'Patrick Mahomes',       position: 'QB',  team: 'KC',  age: 31, baseValue: 90 },
    { rank: 12, name: 'Puka Nacua',            position: 'WR',  team: 'LAR', age: 25, baseValue: 89 },
    { rank: 13, name: 'Jonathan Taylor',       position: 'RB',  team: 'IND', age: 28, baseValue: 88 },
    { rank: 14, name: "De'Von Achane",         position: 'RB',  team: 'MIA', age: 24, baseValue: 88 },
    { rank: 15, name: 'Jalen Hurts',           position: 'QB',  team: 'PHI', age: 28, baseValue: 87 },
    { rank: 16, name: 'Garrett Wilson',        position: 'WR',  team: 'NYJ', age: 26, baseValue: 86 },
    { rank: 17, name: 'Malik Nabers',          position: 'WR',  team: 'NYG', age: 23, baseValue: 86 },
    { rank: 18, name: 'Nico Collins',          position: 'WR',  team: 'HOU', age: 27, baseValue: 85 },
    { rank: 19, name: 'Josh Jacobs',           position: 'RB',  team: 'GB',  age: 28, baseValue: 85 },
    { rank: 20, name: 'Drake London',          position: 'WR',  team: 'ATL', age: 25, baseValue: 84 },
    { rank: 21, name: 'Kyren Williams',        position: 'RB',  team: 'LAR', age: 26, baseValue: 84 },
    { rank: 22, name: 'Joe Burrow',            position: 'QB',  team: 'CIN', age: 30, baseValue: 84 },
    { rank: 10, name: 'Marvin Harrison Jr',    position: 'WR',  team: 'ARI', age: 24, baseValue: 93 },
    { rank: 24, name: 'Kenneth Walker',        position: 'RB',  team: 'SEA', age: 26, baseValue: 82 },
    { rank: 25, name: 'Sam LaPorta',           position: 'TE',  team: 'DET', age: 25, baseValue: 82 },
    { rank: 26, name: 'Brock Bowers',          position: 'TE',  team: 'LV',  age: 23, baseValue: 81 },
    { rank: 27, name: 'Derrick Henry',         position: 'RB',  team: 'BAL', age: 33, baseValue: 80 },
    { rank: 28, name: 'DeVonta Smith',         position: 'WR',  team: 'PHI', age: 27, baseValue: 79 },
    { rank: 29, name: 'James Cook',            position: 'RB',  team: 'BUF', age: 26, baseValue: 78 },
    { rank: 30, name: 'CJ Stroud',             position: 'QB',  team: 'HOU', age: 25, baseValue: 78 },
    { rank: 31, name: 'Jayden Daniels',        position: 'QB',  team: 'WSH', age: 25, baseValue: 77 },
    { rank: 32, name: 'DK Metcalf',            position: 'WR',  team: 'SEA', age: 29, baseValue: 77 },
    { rank: 33, name: 'Trey McBride',          position: 'TE',  team: 'ARI', age: 26, baseValue: 76 },
    { rank: 34, name: 'Travis Etienne',        position: 'RB',  team: 'JAX', age: 28, baseValue: 75 },
    { rank: 35, name: 'Tee Higgins',           position: 'WR',  team: 'CIN', age: 28, baseValue: 74 },
    { rank: 36, name: 'Brian Thomas Jr',       position: 'WR',  team: 'JAX', age: 24, baseValue: 74 },
    { rank: 37, name: 'Chris Olave',           position: 'WR',  team: 'NO',  age: 26, baseValue: 73 },
    { rank: 38, name: 'Jaylen Waddle',         position: 'WR',  team: 'DEN', age: 28, baseValue: 72 },
    { rank: 39, name: 'Isiah Pacheco',         position: 'RB',  team: 'KC',  age: 27, baseValue: 72 },
    { rank: 40, name: 'George Kittle',         position: 'TE',  team: 'SF',  age: 33, baseValue: 71 },
    { rank: 41, name: 'Zay Flowers',           position: 'WR',  team: 'BAL', age: 25, baseValue: 70 },
    { rank: 42, name: 'David Montgomery',      position: 'RB',  team: 'DET', age: 29, baseValue: 69 },
    { rank: 43, name: 'Anthony Richardson',    position: 'QB',  team: 'IND', age: 24, baseValue: 36 },
    { rank: 44, name: 'Ladd McConkey',         position: 'WR',  team: 'LAC', age: 24, baseValue: 68 },
    { rank: 45, name: 'Mark Andrews',          position: 'TE',  team: 'BAL', age: 31, baseValue: 67 },
    { rank: 46, name: 'Chase Brown',           position: 'RB',  team: 'CIN', age: 25, baseValue: 68 },
    { rank: 47, name: 'Rachaad White',         position: 'RB',  team: 'TB',  age: 27, baseValue: 66 },
    { rank: 48, name: 'Joe Mixon',             position: 'RB',  team: 'HOU', age: 30, baseValue: 65 },
    { rank: 48, name: 'Travis Kelce',          position: 'TE',  team: 'KC',  age: 38, baseValue: 58 },
    { rank: 49, name: 'Aaron Jones',           position: 'RB',  team: 'MIN', age: 32, baseValue: 63 },
    { rank: 50, name: 'Dalton Kincaid',        position: 'TE',  team: 'BUF', age: 26, baseValue: 62 },
    { rank: 51, name: 'TreVeyon Henderson',     position: 'RB',  team: 'NE',  age: 24, baseValue: 67 },
    { rank: 52, name: 'Kyle Pitts',            position: 'TE',  team: 'ATL', age: 26, baseValue: 58 },
    { rank: 53, name: 'Jonathon Brooks',       position: 'RB',  team: 'CAR', age: 23, baseValue: 55 },
    { rank: 54, name: 'Harrison Butker',       position: 'K',   team: 'KC',  age: 31, baseValue: 52 },
    { rank: 55, name: 'Brandon Aubrey',        position: 'K',   team: 'DAL', age: 30, baseValue: 50 },
    { rank: 56, name: 'San Francisco DEF',     position: 'DEF', team: 'SF',  age:  0, baseValue: 48 },
    { rank: 57, name: 'Dallas DEF',            position: 'DEF', team: 'DAL', age:  0, baseValue: 45 },
    { rank: 58, name: "Ka'imi Fairbairn",      position: 'K',   team: 'HOU', age: 33, baseValue: 42 },
    { rank: 59, name: 'Baltimore DEF',         position: 'DEF', team: 'BAL', age:  0, baseValue: 40 },
    { rank: 60, name: 'Jake Moody',            position: 'K',   team: 'SF',  age: 27, baseValue: 38 },

    // ── RANKS 61–120 ─────────────────────────────────────────────────────────
    { rank:  61, name: 'Justin Jefferson',     position: 'WR',  team: 'MIN', age: 27, baseValue: 93 },
    { rank:  62, name: 'Christian McCaffrey',  position: 'RB',  team: 'SF',  age: 31, baseValue: 87 },
    { rank:  63, name: 'Caleb Williams',       position: 'QB',  team: 'CHI', age: 24, baseValue: 76 },
    { rank:  64, name: 'Jake Ferguson',        position: 'TE',  team: 'DAL', age: 26, baseValue: 61 },
    { rank:  65, name: 'Evan Engram',          position: 'TE',  team: 'JAX', age: 32, baseValue: 60 },
    { rank:  66, name: "Ja'Tavion Sanders",    position: 'TE',  team: 'CAR', age: 24, baseValue: 54 },
    { rank:  67, name: 'Xavier Worthy',        position: 'WR',  team: 'KC',  age: 23, baseValue: 67 },
    { rank:  68, name: 'Deebo Samuel',         position: 'WR',  team: 'SF',  age: 30, baseValue: 63 },
    { rank:  69, name: 'Keon Coleman',         position: 'WR',  team: 'BUF', age: 24, baseValue: 64 },
    { rank:  70, name: 'Jordan Love',          position: 'QB',  team: 'GB',  age: 28, baseValue: 76 },
    { rank:  71, name: 'Dak Prescott',         position: 'QB',  team: 'DAL', age: 33, baseValue: 75 },
    { rank:  72, name: "D'Andre Swift",        position: 'RB',  team: 'CHI', age: 27, baseValue: 63 },
    { rank:  73, name: 'Chuba Hubbard',        position: 'RB',  team: 'CAR', age: 26, baseValue: 61 },
    { rank:  74, name: 'Tank Dell',            position: 'WR',  team: 'HOU', age: 26, baseValue: 66 },
    { rank:  75, name: 'Davante Adams',        position: 'WR',  team: 'FA',  age: 34, baseValue: 62 },
    { rank:  76, name: 'Rashee Rice',          position: 'WR',  team: 'KC',  age: 25, baseValue: 70 },
    { rank:  77, name: 'Rome Odunze',          position: 'WR',  team: 'CHI', age: 24, baseValue: 68 },
    { rank:  78, name: 'Alvin Kamara',         position: 'RB',  team: 'NO',  age: 31, baseValue: 62 },
    { rank:  79, name: 'Tony Pollard',         position: 'RB',  team: 'TEN', age: 29, baseValue: 59 },
    { rank:  80, name: 'Jayden Reed',          position: 'WR',  team: 'GB',  age: 26, baseValue: 67 },
    { rank:  81, name: 'Christian Watson',     position: 'WR',  team: 'GB',  age: 26, baseValue: 63 },
    { rank:  82, name: 'Jameson Williams',     position: 'WR',  team: 'DET', age: 24, baseValue: 68 },
    { rank:  83, name: 'Michael Pittman Jr',   position: 'WR',  team: 'IND', age: 28, baseValue: 64 },
    { rank:  84, name: 'Stefon Diggs',         position: 'WR',  team: 'HOU', age: 33, baseValue: 61 },
    { rank:  85, name: 'Quentin Johnston',     position: 'WR',  team: 'LAC', age: 24, baseValue: 63 },
    { rank:  86, name: 'Javonte Williams',     position: 'RB',  team: 'DEN', age: 26, baseValue: 60 },
    { rank:  87, name: 'Ezekiel Elliott',      position: 'RB',  team: 'FA',  age: 32, baseValue: 40 },
    { rank:  88, name: 'Tyler Lockett',        position: 'WR',  team: 'KC',  age: 35, baseValue: 53 },
    { rank:  89, name: 'Curtis Samuel',        position: 'WR',  team: 'BUF', age: 30, baseValue: 55 },
    { rank:  90, name: 'Elijah Moore',         position: 'WR',  team: 'CLE', age: 26, baseValue: 58 },
    { rank:  91, name: 'Sam Darnold',          position: 'QB',  team: 'SEA', age: 30, baseValue: 78 },
    { rank:  92, name: 'Gus Edwards',          position: 'RB',  team: 'LAC', age: 31, baseValue: 55 },
    { rank:  93, name: 'Zach Charbonnet',      position: 'RB',  team: 'SEA', age: 25, baseValue: 61 },
    { rank:  94, name: 'Miles Sanders',        position: 'RB',  team: 'CAR', age: 29, baseValue: 52 },
    { rank:  95, name: 'Tyjae Spears',         position: 'RB',  team: 'TEN', age: 25, baseValue: 59 },
    { rank:  96, name: 'Amari Cooper',         position: 'WR',  team: 'BUF', age: 32, baseValue: 60 },
    { rank:  97, name: 'Treylon Burks',        position: 'WR',  team: 'TEN', age: 26, baseValue: 57 },
    { rank:  98, name: 'Wan\'Dale Robinson',   position: 'WR',  team: 'NYG', age: 25, baseValue: 60 },
    { rank:  99, name: 'Jerome Ford',          position: 'RB',  team: 'CLE', age: 26, baseValue: 58 },
    { rank: 100, name: 'Antonio Gibson',       position: 'RB',  team: 'NE',  age: 28, baseValue: 54 },
    { rank: 101, name: 'Bo Nix',              position: 'QB',  team: 'DEN', age: 26, baseValue: 71 },
    { rank: 102, name: 'Bryce Young',         position: 'QB',  team: 'CAR', age: 25, baseValue: 67 },
    { rank: 103, name: 'C.J. Uzomah',         position: 'TE',  team: 'NYJ', age: 33, baseValue: 47 },
    { rank: 104, name: 'Hunter Henry',        position: 'TE',  team: 'NE',  age: 31, baseValue: 48 },
    { rank: 105, name: 'Greg Dulcich',        position: 'TE',  team: 'DEN', age: 26, baseValue: 49 },
    { rank: 106, name: 'Jonnu Smith',         position: 'TE',  team: 'MIA', age: 31, baseValue: 50 },
    { rank: 107, name: 'Tyler Conklin',       position: 'TE',  team: 'NYJ', age: 31, baseValue: 46 },
    { rank: 108, name: 'Chigoziem Okonkwo',   position: 'TE',  team: 'TEN', age: 27, baseValue: 52 },
    { rank: 109, name: 'Isaiah Likely',       position: 'TE',  team: 'BAL', age: 26, baseValue: 55 },
    { rank: 110, name: 'Tucker Kraft',        position: 'TE',  team: 'GB',  age: 25, baseValue: 68 },
    { rank: 111, name: 'Michael Mayer',       position: 'TE',  team: 'LV',  age: 24, baseValue: 51 },
    { rank: 112, name: 'Luke Musgrave',       position: 'TE',  team: 'GB',  age: 26, baseValue: 50 },
    { rank: 113, name: 'Brenton Strange',     position: 'TE',  team: 'JAX', age: 26, baseValue: 48 },
    { rank: 114, name: 'Noah Fant',           position: 'TE',  team: 'SEA', age: 29, baseValue: 49 },
    { rank: 115, name: 'Cole Kmet',           position: 'TE',  team: 'CHI', age: 27, baseValue: 54 },
    { rank: 116, name: 'Pat Freiermuth',      position: 'TE',  team: 'PIT', age: 27, baseValue: 53 },
    { rank: 117, name: 'Will Dissly',         position: 'TE',  team: 'LAC', age: 30, baseValue: 45 },
    { rank: 118, name: 'Dawson Knox',         position: 'TE',  team: 'BUF', age: 29, baseValue: 50 },
    { rank: 119, name: 'Foster Moreau',       position: 'TE',  team: 'NO',  age: 29, baseValue: 46 },
    { rank: 120, name: 'Ben Sinnott',         position: 'TE',  team: 'WSH', age: 25, baseValue: 51 },

    // ── RANKS 121–180 ────────────────────────────────────────────────────────
    { rank: 121, name: 'Ashton Jeanty',        position: 'RB',  team: 'LV',  age: 23, baseValue: 75 },
    { rank: 122, name: 'Khalil Shakir',       position: 'WR',  team: 'BUF', age: 26, baseValue: 62 },
    { rank: 123, name: 'Cedric Tillman',      position: 'WR',  team: 'CLE', age: 26, baseValue: 58 },
    { rank: 124, name: 'Courtland Sutton',    position: 'WR',  team: 'DEN', age: 30, baseValue: 60 },
    { rank: 125, name: 'Diontae Johnson',     position: 'WR',  team: 'HOU', age: 30, baseValue: 58 },
    { rank: 126, name: 'Jaxon Smith-Njigba',  position: 'WR',  team: 'SEA', age: 25, baseValue: 87 },
    { rank: 127, name: 'Brandin Cooks',       position: 'WR',  team: 'FA',  age: 34, baseValue: 40 },
    { rank: 128, name: 'Adam Thielen',        position: 'WR',  team: 'FA',  age: 37, baseValue: 35 },
    { rank: 129, name: 'DJ Moore',            position: 'WR',  team: 'FA',  age: 30, baseValue: 61 },
    { rank: 130, name: 'Dontayvion Wicks',    position: 'WR',  team: 'GB',  age: 25, baseValue: 59 },
    { rank: 131, name: 'Elijah Mitchell',     position: 'RB',  team: 'SF',  age: 28, baseValue: 56 },
    { rank: 132, name: 'Kareem Hunt',         position: 'RB',  team: 'KC',  age: 31, baseValue: 54 },
    { rank: 133, name: 'Dameon Pierce',       position: 'RB',  team: 'HOU', age: 26, baseValue: 57 },
    { rank: 134, name: 'Khalil Herbert',      position: 'RB',  team: 'CHI', age: 27, baseValue: 55 },
    { rank: 135, name: 'Alexander Mattison',  position: 'RB',  team: 'MIN', age: 28, baseValue: 56 },
    { rank: 136, name: 'Roschon Johnson',     position: 'RB',  team: 'CHI', age: 25, baseValue: 55 },
    { rank: 137, name: 'Hassan Haskins',      position: 'RB',  team: 'LAR', age: 27, baseValue: 50 },
    { rank: 138, name: 'Tyler Allgeier',      position: 'RB',  team: 'ATL', age: 25, baseValue: 57 },
    { rank: 139, name: 'Pierre Strong Jr',    position: 'RB',  team: 'CLE', age: 26, baseValue: 51 },
    { rank: 140, name: 'Trey Sermon',         position: 'RB',  team: 'TEN', age: 27, baseValue: 50 },
    { rank: 141, name: 'Tank Bigsby',         position: 'RB',  team: 'JAX', age: 24, baseValue: 58 },
    { rank: 142, name: 'Deuce Vaughn',        position: 'RB',  team: 'DAL', age: 25, baseValue: 50 },
    { rank: 143, name: 'Rico Dowdle',         position: 'RB',  team: 'DAL', age: 27, baseValue: 55 },
    { rank: 144, name: 'Jaylen Warren',       position: 'RB',  team: 'PIT', age: 27, baseValue: 54 },
    { rank: 145, name: 'Patrick Taylor',      position: 'RB',  team: 'GB',  age: 28, baseValue: 48 },
    { rank: 146, name: 'Cam Akers',           position: 'RB',  team: 'MIN', age: 26, baseValue: 52 },
    { rank: 147, name: 'Zamir White',         position: 'RB',  team: 'LV',  age: 26, baseValue: 54 },
    { rank: 148, name: 'Darnell Mooney',      position: 'WR',  team: 'ATL', age: 28, baseValue: 59 },
    { rank: 149, name: 'Odell Beckham Jr',    position: 'WR',  team: 'MIA', age: 34, baseValue: 50 },
    { rank: 150, name: 'Michael Wilson',      position: 'WR',  team: 'ARI', age: 26, baseValue: 57 },
    { rank: 151, name: 'Joshua Palmer',       position: 'WR',  team: 'LAC', age: 26, baseValue: 58 },
    { rank: 152, name: 'Rashod Bateman',      position: 'WR',  team: 'BAL', age: 26, baseValue: 57 },
    { rank: 153, name: 'Rondale Moore',       position: 'WR',  team: 'ARI', age: 26, baseValue: 55 },
    { rank: 154, name: 'Demarcus Robinson',   position: 'WR',  team: 'LAR', age: 31, baseValue: 51 },
    { rank: 155, name: 'Nelson Agholor',      position: 'WR',  team: 'NE',  age: 33, baseValue: 48 },
    { rank: 156, name: 'Jerry Jeudy',         position: 'WR',  team: 'CLE', age: 27, baseValue: 59 },
    { rank: 157, name: 'Allen Robinson II',   position: 'WR',  team: 'FA',  age: 34, baseValue: 35 },
    { rank: 158, name: 'Van Jefferson',       position: 'WR',  team: 'ATL', age: 29, baseValue: 52 },
    { rank: 159, name: 'Kadarius Toney',      position: 'WR',  team: 'FA',  age: 28, baseValue: 42 },
    { rank: 160, name: 'Parris Campbell',     position: 'WR',  team: 'PIT', age: 30, baseValue: 50 },
    { rank: 161, name: 'Donovan Peoples-Jones',position:'WR',  team: 'DET', age: 27, baseValue: 55 },
    { rank: 162, name: 'Jordan Addison',      position: 'WR',  team: 'MIN', age: 24, baseValue: 65 },
    { rank: 163, name: 'George Pickens',      position: 'WR',  team: 'DAL', age: 26, baseValue: 83 },
    { rank: 164, name: 'Dalton Schultz',      position: 'TE',  team: 'HOU', age: 31, baseValue: 48 },
    { rank: 165, name: 'Tyler Higbee',        position: 'TE',  team: 'LAR', age: 32, baseValue: 47 },
    { rank: 166, name: 'Hayden Hurst',        position: 'TE',  team: 'CAR', age: 33, baseValue: 44 },
    { rank: 167, name: 'T.J. Hockenson',      position: 'TE',  team: 'MIN', age: 28, baseValue: 56 },
    { rank: 168, name: 'David Njoku',         position: 'TE',  team: 'CLE', age: 29, baseValue: 55 },
    { rank: 169, name: 'Mike Gesicki',        position: 'TE',  team: 'NE',  age: 30, baseValue: 48 },
    { rank: 170, name: 'Mo Alie-Cox',         position: 'TE',  team: 'IND', age: 31, baseValue: 43 },
    { rank: 171, name: 'Irv Smith Jr',        position: 'TE',  team: 'CIN', age: 29, baseValue: 47 },
    { rank: 172, name: 'Juwan Johnson',       position: 'TE',  team: 'NO',  age: 29, baseValue: 46 },
    { rank: 173, name: 'Durham Smythe',       position: 'TE',  team: 'MIA', age: 30, baseValue: 42 },
    { rank: 174, name: 'Gerald Everett',      position: 'TE',  team: 'LAC', age: 31, baseValue: 45 },
    { rank: 175, name: 'Cade Otton',          position: 'TE',  team: 'TB',  age: 26, baseValue: 50 },
    { rank: 176, name: 'Lawrence Cager',      position: 'TE',  team: 'NYG', age: 29, baseValue: 41 },
    { rank: 177, name: 'Logan Thomas',        position: 'TE',  team: 'WSH', age: 35, baseValue: 40 },
    { rank: 178, name: 'Kylen Granson',       position: 'TE',  team: 'IND', age: 28, baseValue: 44 },
    { rank: 179, name: 'Drew Sample',         position: 'TE',  team: 'CIN', age: 29, baseValue: 41 },
    { rank: 180, name: 'Adam Trautman',       position: 'TE',  team: 'DEN', age: 29, baseValue: 42 },

    // ── RANKS 181–240 ────────────────────────────────────────────────────────
    { rank: 181, name: 'Geno Smith',          position: 'QB',  team: 'SEA', age: 37, baseValue: 63 },
    { rank: 182, name: 'Baker Mayfield',      position: 'QB',  team: 'TB',  age: 31, baseValue: 68 },
    { rank: 183, name: 'Derek Carr',          position: 'QB',  team: 'NO',  age: 35, baseValue: 63 },
    { rank: 184, name: 'Justin Fields',       position: 'QB',  team: 'PIT', age: 27, baseValue: 67 },
    { rank: 185, name: 'Tua Tagovailoa',      position: 'QB',  team: 'ATL', age: 29, baseValue: 67 },
    { rank: 186, name: 'Kirk Cousins',        position: 'QB',  team: 'ATL', age: 39, baseValue: 71 },
    { rank: 187, name: 'Matthew Stafford',    position: 'QB',  team: 'LAR', age: 38, baseValue: 64 },
    { rank: 188, name: 'Russell Wilson',      position: 'QB',  team: 'PIT', age: 38, baseValue: 63 },
    { rank: 189, name: 'Trevor Lawrence',     position: 'QB',  team: 'JAX', age: 27, baseValue: 73 },
    { rank: 190, name: 'Deshaun Watson',      position: 'QB',  team: 'CLE', age: 31, baseValue: 65 },
    { rank: 191, name: 'Zach Wilson',         position: 'QB',  team: 'DEN', age: 27, baseValue: 60 },
    { rank: 192, name: 'Kenny Pickett',       position: 'QB',  team: 'PHI', age: 28, baseValue: 61 },
    { rank: 193, name: 'Kyler Murray',         position: 'QB',  team: 'ARI', age: 30, baseValue: 72 },
    { rank: 194, name: 'Aidan O\'Connell',   position: 'QB',  team: 'LV',  age: 27, baseValue: 59 },
    { rank: 195, name: 'Gardner Minshew',     position: 'QB',  team: 'LV',  age: 30, baseValue: 58 },
    { rank: 196, name: 'Will Levis',          position: 'QB',  team: 'TEN', age: 27, baseValue: 63 },
    { rank: 197, name: 'Tyson Bagent',        position: 'QB',  team: 'CHI', age: 26, baseValue: 55 },
    { rank: 198, name: 'Joshua Dobbs',        position: 'QB',  team: 'SF',  age: 31, baseValue: 53 },
    { rank: 199, name: 'Malik Willis',        position: 'QB',  team: 'MIA', age: 28, baseValue: 72 },
    { rank: 200, name: 'Taylor Heinicke',     position: 'QB',  team: 'ATL', age: 32, baseValue: 54 },
    { rank: 201, name: 'Raheem Mostert',      position: 'RB',  team: 'MIA', age: 34, baseValue: 50 },
    { rank: 202, name: 'Samaje Perine',       position: 'RB',  team: 'DEN', age: 30, baseValue: 50 },
    { rank: 203, name: 'Ty Chandler',         position: 'RB',  team: 'MIN', age: 26, baseValue: 51 },
    { rank: 204, name: 'Jaleel McLaughlin',   position: 'RB',  team: 'DEN', age: 26, baseValue: 52 },
    { rank: 205, name: 'Travis Homer',        position: 'RB',  team: 'CHI', age: 29, baseValue: 47 },
    { rank: 206, name: 'Latavius Murray',     position: 'RB',  team: 'BUF', age: 36, baseValue: 42 },
    { rank: 207, name: 'Clyde Edwards-Helaire',position:'RB',  team: 'KC',  age: 27, baseValue: 53 },
    { rank: 208, name: 'D\'Onta Foreman',     position: 'RB',  team: 'CHI', age: 29, baseValue: 48 },
    { rank: 209, name: 'Deon Jackson',        position: 'RB',  team: 'IND', age: 28, baseValue: 46 },
    { rank: 210, name: 'Kenyan Drake',        position: 'RB',  team: 'BUF', age: 32, baseValue: 44 },
    { rank: 211, name: 'Emanuel Wilson',      position: 'RB',  team: 'GB',  age: 26, baseValue: 50 },
    { rank: 212, name: 'Boston Scott',        position: 'RB',  team: 'PHI', age: 31, baseValue: 43 },
    { rank: 213, name: 'Eno Benjamin',        position: 'RB',  team: 'ARI', age: 27, baseValue: 47 },
    { rank: 214, name: 'Keith Smith',         position: 'RB',  team: 'ATL', age: 32, baseValue: 40 },
    { rank: 215, name: 'Joshua Kelley',       position: 'RB',  team: 'LAC', age: 28, baseValue: 46 },
    { rank: 216, name: 'Justice Hill',        position: 'RB',  team: 'BAL', age: 28, baseValue: 48 },
    { rank: 217, name: 'Cordarrelle Patterson',position:'RB',  team: 'PIT', age: 34, baseValue: 43 },
    { rank: 218, name: 'Duke Johnson',        position: 'RB',  team: 'HOU', age: 32, baseValue: 41 },
    { rank: 219, name: 'Dwayne Washington',   position: 'RB',  team: 'NO',  age: 31, baseValue: 40 },
    { rank: 220, name: 'Mike Boone',          position: 'RB',  team: 'DEN', age: 31, baseValue: 42 },
    { rank: 221, name: 'Arik Gilbert',        position: 'TE',  team: 'GB',  age: 24, baseValue: 46 },
    { rank: 222, name: 'Pharaoh Brown',       position: 'TE',  team: 'HOU', age: 31, baseValue: 41 },
    { rank: 223, name: 'Ian Thomas',          position: 'TE',  team: 'CAR', age: 28, baseValue: 42 },
    { rank: 224, name: 'Nick Vannett',        position: 'TE',  team: 'NO',  age: 33, baseValue: 40 },
    { rank: 225, name: 'Zach Ertz',           position: 'TE',  team: 'WSH', age: 35, baseValue: 43 },
    { rank: 226, name: 'Robert Tonyan',       position: 'TE',  team: 'MIN', age: 32, baseValue: 44 },
    { rank: 227, name: 'Tanner Hudson',       position: 'TE',  team: 'BUF', age: 30, baseValue: 42 },
    { rank: 228, name: 'Kenny Yeboah',        position: 'TE',  team: 'NYJ', age: 27, baseValue: 43 },
    { rank: 229, name: 'Teagan Quitoriano',   position: 'TE',  team: 'HOU', age: 26, baseValue: 44 },
    { rank: 230, name: 'Josh Oliver',         position: 'TE',  team: 'MIN', age: 29, baseValue: 41 },
    { rank: 231, name: 'Parker Washington',   position: 'WR',  team: 'PIT', age: 25, baseValue: 55 },
    { rank: 232, name: 'Chase Claypool',      position: 'WR',  team: 'MIA', age: 27, baseValue: 52 },
    { rank: 233, name: 'Mecole Hardman',      position: 'WR',  team: 'KC',  age: 28, baseValue: 53 },
    { rank: 234, name: 'JuJu Smith-Schuster', position: 'WR',  team: 'NE',  age: 30, baseValue: 50 },
    { rank: 235, name: 'Jalen Tolbert',       position: 'WR',  team: 'DAL', age: 27, baseValue: 53 },
    { rank: 236, name: 'Greg Dortch',         position: 'WR',  team: 'ARI', age: 29, baseValue: 51 },
    { rank: 237, name: 'Marquez Valdes-Scantling',position:'WR',team:'NO',  age: 31, baseValue: 50 },
    { rank: 238, name: 'Andrel Anthony',      position: 'WR',  team: 'CIN', age: 24, baseValue: 54 },
    { rank: 239, name: 'Velus Jones Jr',      position: 'WR',  team: 'CHI', age: 28, baseValue: 50 },
    { rank: 240, name: 'Kendall Hinton',      position: 'WR',  team: 'DEN', age: 28, baseValue: 48 },

    // ── RANKS 241–300 ────────────────────────────────────────────────────────
    { rank: 241, name: 'Evan McPherson',      position: 'K',   team: 'CIN', age: 27, baseValue: 46 },
    { rank: 242, name: 'Jake Elliott',        position: 'K',   team: 'PHI', age: 31, baseValue: 45 },
    { rank: 243, name: 'Tyler Bass',          position: 'K',   team: 'BUF', age: 29, baseValue: 44 },
    { rank: 244, name: 'Chris Boswell',       position: 'K',   team: 'PIT', age: 34, baseValue: 43 },
    { rank: 245, name: 'Younghoe Koo',        position: 'K',   team: 'ATL', age: 32, baseValue: 43 },
    { rank: 246, name: 'Jason Sanders',       position: 'K',   team: 'MIA', age: 30, baseValue: 42 },
    { rank: 247, name: 'Cameron Dicker',      position: 'K',   team: 'LAC', age: 27, baseValue: 42 },
    { rank: 248, name: 'Greg Joseph',         position: 'K',   team: 'MIN', age: 32, baseValue: 41 },
    { rank: 249, name: 'Nick Folk',           position: 'K',   team: 'TEN', age: 41, baseValue: 38 },
    { rank: 250, name: 'Matt Ammendola',      position: 'K',   team: 'NYJ', age: 29, baseValue: 39 },
    { rank: 251, name: 'Kansas City DEF',     position: 'DEF', team: 'KC',  age:  0, baseValue: 44 },
    { rank: 252, name: 'Philadelphia DEF',    position: 'DEF', team: 'PHI', age:  0, baseValue: 43 },
    { rank: 253, name: 'Pittsburgh DEF',      position: 'DEF', team: 'PIT', age:  0, baseValue: 42 },
    { rank: 254, name: 'Cleveland DEF',       position: 'DEF', team: 'CLE', age:  0, baseValue: 41 },
    { rank: 255, name: 'Buffalo DEF',         position: 'DEF', team: 'BUF', age:  0, baseValue: 41 },
    { rank: 256, name: 'New York Jets DEF',   position: 'DEF', team: 'NYJ', age:  0, baseValue: 40 },
    { rank: 257, name: 'New England DEF',     position: 'DEF', team: 'NE',  age:  0, baseValue: 38 },
    { rank: 258, name: 'Houston DEF',         position: 'DEF', team: 'HOU', age:  0, baseValue: 39 },
    { rank: 259, name: 'Detroit DEF',         position: 'DEF', team: 'DET', age:  0, baseValue: 40 },
    { rank: 260, name: 'Indianapolis DEF',    position: 'DEF', team: 'IND', age:  0, baseValue: 37 },
    { rank: 261, name: 'Tetairoa McMillan',   position: 'WR',  team: 'CAR', age: 23, baseValue: 62 },
    { rank: 262, name: 'Trent Sherfield',     position: 'WR',  team: 'MIN', age: 30, baseValue: 48 },
    { rank: 263, name: 'Montrell Washington', position: 'WR',  team: 'DEN', age: 26, baseValue: 50 },
    { rank: 264, name: 'Ray-Ray McCloud',     position: 'WR',  team: 'SF',  age: 29, baseValue: 45 },
    { rank: 265, name: 'Laquon Treadwell',    position: 'WR',  team: 'JAX', age: 30, baseValue: 46 },
    { rank: 266, name: 'Byron Pringle',       position: 'WR',  team: 'CHI', age: 32, baseValue: 43 },
    { rank: 267, name: 'Damiere Byrd',        position: 'WR',  team: 'ATL', age: 32, baseValue: 43 },
    { rank: 268, name: 'Malik Turner',        position: 'WR',  team: 'CHI', age: 31, baseValue: 42 },
    { rank: 269, name: 'John Ross',           position: 'WR',  team: 'WSH', age: 30, baseValue: 42 },
    { rank: 270, name: 'Freddie Swain',       position: 'WR',  team: 'SEA', age: 28, baseValue: 41 },
    { rank: 271, name: 'Jamari Thrash',       position: 'WR',  team: 'CLE', age: 25, baseValue: 52 },
    { rank: 272, name: 'Tutu Atwell',         position: 'WR',  team: 'LAR', age: 25, baseValue: 53 },
    { rank: 273, name: 'Elijah Higgins',      position: 'WR',  team: 'ARI', age: 25, baseValue: 51 },
    { rank: 274, name: 'Travis Hunter',        position: 'WR',  team: 'JAX', age: 23, baseValue: 66 },
    { rank: 275, name: 'Devaughn Vele',       position: 'WR',  team: 'DEN', age: 25, baseValue: 52 },
    { rank: 276, name: 'Luke McCaffrey',      position: 'WR',  team: 'WSH', age: 24, baseValue: 54 },
    { rank: 277, name: 'Jalen McMillan',      position: 'WR',  team: 'TB',  age: 24, baseValue: 55 },
    { rank: 278, name: 'Adonai Mitchell',     position: 'WR',  team: 'IND', age: 23, baseValue: 57 },
    { rank: 279, name: 'Ricky Pearsall',      position: 'WR',  team: 'SF',  age: 25, baseValue: 56 },
    { rank: 280, name: 'Xavier Legette',      position: 'WR',  team: 'CAR', age: 25, baseValue: 55 },
    { rank: 281, name: 'Ray Davis',           position: 'RB',  team: 'BUF', age: 26, baseValue: 53 },
    { rank: 282, name: 'Audric Estime',       position: 'RB',  team: 'DEN', age: 23, baseValue: 54 },
    { rank: 283, name: 'MarShawn Lloyd',      position: 'RB',  team: 'GB',  age: 24, baseValue: 52 },
    { rank: 284, name: 'Blake Corum',         position: 'RB',  team: 'LAR', age: 24, baseValue: 53 },
    { rank: 285, name: 'Will Shipley',        position: 'RB',  team: 'PHI', age: 24, baseValue: 52 },
    { rank: 286, name: 'Braelon Allen',       position: 'RB',  team: 'NYJ', age: 22, baseValue: 55 },
    { rank: 287, name: 'Kimani Vidal',        position: 'RB',  team: 'LAC', age: 24, baseValue: 51 },
    { rank: 288, name: 'Dylan Laube',         position: 'RB',  team: 'LV',  age: 25, baseValue: 50 },
    { rank: 289, name: 'Isaac Guerendo',      position: 'RB',  team: 'SF',  age: 26, baseValue: 54 },
    { rank: 290, name: 'Quinshon Judkins',    position: 'RB',  team: 'CLE', age: 22, baseValue: 55 },
    { rank: 291, name: 'Rhamondre Stevenson',  position: 'RB',  team: 'FA',  age: 28, baseValue: 48 },
    { rank: 292, name: 'Cody Schrader',       position: 'RB',  team: 'LAR', age: 27, baseValue: 48 },
    { rank: 293, name: 'Tyrone Tracy Jr',     position: 'RB',  team: 'NYG', age: 25, baseValue: 54 },
    { rank: 294, name: 'Keaton Mitchell',      position: 'RB',  team: 'BAL', age: 24, baseValue: 51 },
    { rank: 295, name: 'Spencer Sanders',     position: 'QB',  team: 'CAR', age: 27, baseValue: 50 },
    { rank: 296, name: 'Tommy DeVito',        position: 'QB',  team: 'NYG', age: 27, baseValue: 50 },
    { rank: 297, name: 'Easton Stick',        position: 'QB',  team: 'LAC', age: 30, baseValue: 48 },
    { rank: 298, name: 'Jacoby Brissett',     position: 'QB',  team: 'NE',  age: 33, baseValue: 49 },
    { rank: 299, name: 'Brandon Allen',       position: 'QB',  team: 'CIN', age: 33, baseValue: 46 },
    { rank: 300, name: 'Trace McSorley',      position: 'QB',  team: 'ARI', age: 30, baseValue: 45 },

    // ── Low-value veterans / backup-only ────────────────────────────────────
    { rank: 301, name: 'Daniel Jones',         position: 'QB',  team: 'IND', age: 30, baseValue: 62 },

    // ── 2025 NOTABLE ROOKIES ─────────────────────────────────────────────────
    { rank: 302, name: 'Cam Ward',             position: 'QB',  team: 'TEN', age: 24, baseValue: 72 },
    { rank: 303, name: 'Shedeur Sanders',      position: 'QB',  team: 'CLE', age: 25, baseValue: 64 },
    { rank: 304, name: 'Omarion Hampton',      position: 'RB',  team: 'LAR', age: 23, baseValue: 63 },

];

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
