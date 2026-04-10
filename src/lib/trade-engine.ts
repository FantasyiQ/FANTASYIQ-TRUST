// FantasyIQ Trust — Dynamic Trade Value Engine
// Formula: BaseValue × WeightedFactors (6 factors summing to 1.0)
// Trade Score: 0–100 scale based on DTV differential

export interface Player {
    rank:      number;
    name:      string;
    position:  string;
    team:      string;
    age:       number;
    baseValue: number;
}

export interface DtvResult extends Player {
    posMultiplier:  number;
    ageMultiplier:  number;
    perfFactor:     number;
    schedFactor:    number;
    injuryFactor:   number;
    situFactor:     number;
    rawDtv:         number;
    pprBoost:       number;
    finalDtv:       number;
    tier:           string;
}

export type PprFormat = 0 | 0.5 | 1;
export type LeagueType = 'Redraft' | 'Dynasty';

// Factor weights — sum to 1.0
const WEIGHTS = {
    posScarcity:  0.25,
    ageCurve:     0.20,
    recentPerf:   0.20,
    schedStrength: 0.15,
    injuryRisk:   0.10,
    teamSituation: 0.10,
};

// Position scarcity multipliers
const SCARCITY: Record<string, number> = {
    QB:  0.95,
    RB:  1.25,
    WR:  1.20,
    TE:  1.10,
    K:   0.85,
    DEF: 0.85,
};

// Catch rate factors for PPR boost
const CATCH_RATE: Record<string, number> = {
    RB:  0.5,
    WR:  1.0,
    TE:  0.8,
    QB:  0,
    K:   0,
    DEF: 0,
};

// Age curve — Redraft is age-neutral (1.0 for all)
function ageMultiplier(position: string, age: number, leagueType: LeagueType): number {
    if (leagueType === 'Redraft') return 1.0;
    if (position === 'K' || position === 'DEF') return 1.0;
    if (age <= 24) return 1.15;
    if (age <= 27) return 1.05;
    if (age <= 30) return 0.95;
    return 0.85;
}

// DTV tier labels
function tier(finalDtv: number): string {
    if (finalDtv >= 85) return 'Elite';
    if (finalDtv >= 70) return 'Star';
    if (finalDtv >= 55) return 'Starter';
    if (finalDtv >= 40) return 'Flex';
    if (finalDtv >= 25) return 'Bench';
    return 'Waiver';
}

export interface PlayerFactors {
    perfFactor:    number; // 0.80–1.20 recent performance
    schedFactor:   number; // 0.85–1.15 schedule strength
    injuryFactor:  number; // 0.70–1.10 injury/health
    situFactor:    number; // 0.80–1.20 team situation
}

const DEFAULT_FACTORS: PlayerFactors = {
    perfFactor:   1.0,
    schedFactor:  1.0,
    injuryFactor: 1.0,
    situFactor:   1.0,
};

export function calcDtv(
    player: Player,
    ppr: PprFormat = 1,
    leagueType: LeagueType = 'Redraft',
    factors: PlayerFactors = DEFAULT_FACTORS,
): DtvResult {
    const posM   = SCARCITY[player.position] ?? 1;
    const ageM   = ageMultiplier(player.position, player.age, leagueType);
    const { perfFactor, schedFactor, injuryFactor, situFactor } = factors;

    // Weighted composite multiplier
    const composite =
        posM          * WEIGHTS.posScarcity  +
        ageM          * WEIGHTS.ageCurve     +
        perfFactor    * WEIGHTS.recentPerf   +
        schedFactor   * WEIGHTS.schedStrength +
        injuryFactor  * WEIGHTS.injuryRisk   +
        situFactor    * WEIGHTS.teamSituation;

    const rawDtv   = Math.round(player.baseValue * composite * 10) / 10;
    const pprBoost = Math.round(CATCH_RATE[player.position] ?? 0) * ppr;
    const finalDtv = Math.round((rawDtv + pprBoost) * 10) / 10;

    return {
        ...player,
        posMultiplier: posM,
        ageMultiplier: ageM,
        perfFactor,
        schedFactor,
        injuryFactor,
        situFactor,
        rawDtv,
        pprBoost,
        finalDtv,
        tier: tier(finalDtv),
    };
}

// Trade Score: 0–100 based on DTV totals
// 50 = perfectly even, >50 = Team A wins, <50 = Team B wins
function tradeScore(totalA: number, totalB: number): number {
    const total = totalA + totalB;
    if (total === 0) return 50;
    return Math.round((totalB / total) * 100); // score from Team A's perspective receiving B's value
}

function verdict(score: number): string {
    if (score >= 90) return 'Slam Dunk';
    if (score >= 75) return 'Strong Win';
    if (score >= 60) return 'Slight Edge';
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
): {
    sideA:     DtvResult[];
    sideB:     DtvResult[];
    totalA:    number;
    totalB:    number;
    diff:      number;
    score:     number;
    verdict:   string;
    winner:    'A' | 'B' | 'Even';
} {
    const a = sideA.map((p, i) => calcDtv(p, ppr, leagueType, factorsA[i] ?? DEFAULT_FACTORS));
    const b = sideB.map((p, i) => calcDtv(p, ppr, leagueType, factorsB[i] ?? DEFAULT_FACTORS));
    const totalA = Math.round(a.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
    const totalB = Math.round(b.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
    const diff   = Math.round(Math.abs(totalA - totalB) * 10) / 10;
    const score  = tradeScore(totalA, totalB);
    const winner: 'A' | 'B' | 'Even' = diff < 2 ? 'Even' : totalB > totalA ? 'A' : 'B';

    return { sideA: a, sideB: b, totalA, totalB, diff, score, verdict: verdict(score), winner };
}

// All 60 players from the updated trade chart
export const PLAYERS: Player[] = [
    { rank:  1, name: "Ja'Marr Chase",        position: 'WR',  team: 'CIN', age: 25, baseValue: 97 },
    { rank:  2, name: 'Bijan Robinson',        position: 'RB',  team: 'ATL', age: 23, baseValue: 96 },
    { rank:  3, name: 'Josh Allen',            position: 'QB',  team: 'BUF', age: 30, baseValue: 95 },
    { rank:  4, name: 'CeeDee Lamb',           position: 'WR',  team: 'DAL', age: 26, baseValue: 95 },
    { rank:  5, name: 'Breece Hall',           position: 'RB',  team: 'NYJ', age: 24, baseValue: 93 },
    { rank:  6, name: 'Lamar Jackson',         position: 'QB',  team: 'BAL', age: 29, baseValue: 93 },
    { rank:  7, name: 'Jahmyr Gibbs',          position: 'RB',  team: 'DET', age: 23, baseValue: 92 },
    { rank:  8, name: 'Tyreek Hill',           position: 'WR',  team: 'MIA', age: 32, baseValue: 91 },
    { rank:  9, name: 'Amon-Ra St. Brown',     position: 'WR',  team: 'DET', age: 25, baseValue: 91 },
    { rank: 10, name: 'Saquon Barkley',        position: 'RB',  team: 'PHI', age: 28, baseValue: 90 },
    { rank: 11, name: 'Patrick Mahomes',       position: 'QB',  team: 'KC',  age: 30, baseValue: 90 },
    { rank: 12, name: 'Puka Nacua',            position: 'WR',  team: 'LAR', age: 24, baseValue: 89 },
    { rank: 13, name: 'Jonathan Taylor',       position: 'RB',  team: 'IND', age: 27, baseValue: 88 },
    { rank: 14, name: "De'Von Achane",         position: 'RB',  team: 'MIA', age: 23, baseValue: 88 },
    { rank: 15, name: 'Jalen Hurts',           position: 'QB',  team: 'PHI', age: 27, baseValue: 87 },
    { rank: 16, name: 'Garrett Wilson',        position: 'WR',  team: 'NYJ', age: 25, baseValue: 86 },
    { rank: 17, name: 'Malik Nabers',          position: 'WR',  team: 'NYG', age: 22, baseValue: 86 },
    { rank: 18, name: 'Nico Collins',          position: 'WR',  team: 'HOU', age: 26, baseValue: 85 },
    { rank: 19, name: 'Josh Jacobs',           position: 'RB',  team: 'GB',  age: 27, baseValue: 85 },
    { rank: 20, name: 'Drake London',          position: 'WR',  team: 'ATL', age: 24, baseValue: 84 },
    { rank: 21, name: 'Kyren Williams',        position: 'RB',  team: 'LAR', age: 25, baseValue: 84 },
    { rank: 22, name: 'Joe Burrow',            position: 'QB',  team: 'CIN', age: 29, baseValue: 84 },
    { rank: 23, name: 'Marvin Harrison Jr',    position: 'WR',  team: 'ARI', age: 23, baseValue: 83 },
    { rank: 24, name: 'Kenneth Walker',        position: 'RB',  team: 'SEA', age: 25, baseValue: 82 },
    { rank: 25, name: 'Sam LaPorta',           position: 'TE',  team: 'DET', age: 24, baseValue: 82 },
    { rank: 26, name: 'Brock Bowers',          position: 'TE',  team: 'LV',  age: 22, baseValue: 81 },
    { rank: 27, name: 'Derrick Henry',         position: 'RB',  team: 'BAL', age: 32, baseValue: 80 },
    { rank: 28, name: 'DeVonta Smith',         position: 'WR',  team: 'PHI', age: 26, baseValue: 79 },
    { rank: 29, name: 'James Cook',            position: 'RB',  team: 'BUF', age: 25, baseValue: 78 },
    { rank: 30, name: 'CJ Stroud',             position: 'QB',  team: 'HOU', age: 24, baseValue: 78 },
    { rank: 31, name: 'Jayden Daniels',        position: 'QB',  team: 'WSH', age: 24, baseValue: 77 },
    { rank: 32, name: 'DK Metcalf',            position: 'WR',  team: 'SEA', age: 28, baseValue: 77 },
    { rank: 33, name: 'Trey McBride',          position: 'TE',  team: 'ARI', age: 25, baseValue: 76 },
    { rank: 34, name: 'Travis Etienne',        position: 'RB',  team: 'JAX', age: 27, baseValue: 75 },
    { rank: 35, name: 'Tee Higgins',           position: 'WR',  team: 'CIN', age: 27, baseValue: 74 },
    { rank: 36, name: 'Brian Thomas Jr',       position: 'WR',  team: 'JAX', age: 23, baseValue: 74 },
    { rank: 37, name: 'Chris Olave',           position: 'WR',  team: 'NO',  age: 25, baseValue: 73 },
    { rank: 38, name: 'Jaylen Waddle',         position: 'WR',  team: 'MIA', age: 26, baseValue: 72 },
    { rank: 39, name: 'Isiah Pacheco',         position: 'RB',  team: 'KC',  age: 26, baseValue: 72 },
    { rank: 40, name: 'George Kittle',         position: 'TE',  team: 'SF',  age: 32, baseValue: 71 },
    { rank: 41, name: 'Zay Flowers',           position: 'WR',  team: 'BAL', age: 24, baseValue: 70 },
    { rank: 42, name: 'David Montgomery',      position: 'RB',  team: 'DET', age: 28, baseValue: 69 },
    { rank: 43, name: 'Anthony Richardson',    position: 'QB',  team: 'IND', age: 23, baseValue: 68 },
    { rank: 44, name: 'Ladd McConkey',         position: 'WR',  team: 'LAC', age: 23, baseValue: 68 },
    { rank: 45, name: 'Mark Andrews',          position: 'TE',  team: 'BAL', age: 30, baseValue: 67 },
    { rank: 46, name: 'Rachaad White',         position: 'RB',  team: 'TB',  age: 26, baseValue: 66 },
    { rank: 47, name: 'Joe Mixon',             position: 'RB',  team: 'HOU', age: 29, baseValue: 65 },
    { rank: 48, name: 'Travis Kelce',          position: 'TE',  team: 'KC',  age: 36, baseValue: 64 },
    { rank: 49, name: 'Aaron Jones',           position: 'RB',  team: 'MIN', age: 31, baseValue: 63 },
    { rank: 50, name: 'Dalton Kincaid',        position: 'TE',  team: 'BUF', age: 25, baseValue: 62 },
    { rank: 51, name: 'Rhamondre Stevenson',   position: 'RB',  team: 'NE',  age: 27, baseValue: 60 },
    { rank: 52, name: 'Kyle Pitts',            position: 'TE',  team: 'ATL', age: 25, baseValue: 58 },
    { rank: 53, name: 'Jonathon Brooks',       position: 'RB',  team: 'CAR', age: 22, baseValue: 55 },
    { rank: 54, name: 'Harrison Butker',       position: 'K',   team: 'KC',  age: 30, baseValue: 52 },
    { rank: 55, name: 'Brandon Aubrey',        position: 'K',   team: 'DAL', age: 29, baseValue: 50 },
    { rank: 56, name: 'San Francisco DEF',     position: 'DEF', team: 'SF',  age:  0, baseValue: 48 },
    { rank: 57, name: 'Dallas DEF',            position: 'DEF', team: 'DAL', age:  0, baseValue: 45 },
    { rank: 58, name: "Ka'imi Fairbairn",      position: 'K',   team: 'HOU', age: 32, baseValue: 42 },
    { rank: 59, name: 'Baltimore DEF',         position: 'DEF', team: 'BAL', age:  0, baseValue: 40 },
    { rank: 60, name: 'Jake Moody',            position: 'K',   team: 'SF',  age: 26, baseValue: 38 },
];
