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
    posScarcity:   0.25,
    ageCurve:      0.20,
    recentPerf:    0.20,
    schedStrength: 0.15,
    injuryRisk:    0.10,
    teamSituation: 0.10,
};

const SCARCITY: Record<string, number> = {
    QB:  0.95,
    RB:  1.25,
    WR:  1.20,
    TE:  1.10,
    K:   0.85,
    DEF: 0.85,
};

const CATCH_RATE: Record<string, number> = {
    RB:  0.5,
    WR:  1.0,
    TE:  0.8,
    QB:  0,
    K:   0,
    DEF: 0,
};

function ageMultiplier(position: string, age: number, leagueType: LeagueType): number {
    if (leagueType === 'Redraft') return 1.0;
    if (position === 'K' || position === 'DEF') return 1.0;
    if (age <= 24) return 1.15;
    if (age <= 27) return 1.05;
    if (age <= 30) return 0.95;
    return 0.85;
}

function tier(finalDtv: number): string {
    if (finalDtv >= 85) return 'Elite';
    if (finalDtv >= 70) return 'Star';
    if (finalDtv >= 55) return 'Starter';
    if (finalDtv >= 40) return 'Flex';
    if (finalDtv >= 25) return 'Bench';
    return 'Waiver';
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
    ppr: PprFormat = 1,
    leagueType: LeagueType = 'Redraft',
    factors: PlayerFactors = DEFAULT_FACTORS,
): DtvResult {
    const posM  = SCARCITY[player.position] ?? 1;
    const ageM  = ageMultiplier(player.position, player.age, leagueType);
    const { perfFactor, schedFactor, injuryFactor, situFactor } = factors;

    const composite =
        posM         * WEIGHTS.posScarcity   +
        ageM         * WEIGHTS.ageCurve      +
        perfFactor   * WEIGHTS.recentPerf    +
        schedFactor  * WEIGHTS.schedStrength +
        injuryFactor * WEIGHTS.injuryRisk    +
        situFactor   * WEIGHTS.teamSituation;

    const rawDtv   = Math.round(player.baseValue * composite * 10) / 10;
    const pprBoost = (CATCH_RATE[player.position] ?? 0) * ppr;
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

function tradeScore(totalA: number, totalB: number): number {
    const total = totalA + totalB;
    if (total === 0) return 50;
    return Math.round((totalB / total) * 100);
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
    sideA:   DtvResult[];
    sideB:   DtvResult[];
    totalA:  number;
    totalB:  number;
    diff:    number;
    score:   number;
    verdict: string;
    winner:  'A' | 'B' | 'Even';
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

// Top 300 NFL Fantasy Players — 2025 season base values (0–100 scale)
export const PLAYERS: Player[] = [
    // ── TOP 60 (from trade chart) ────────────────────────────────────────────
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
    { rank: 51, name: 'TreVeyon Henderson',     position: 'RB',  team: 'NE',  age: 23, baseValue: 67 },
    { rank: 52, name: 'Kyle Pitts',            position: 'TE',  team: 'ATL', age: 25, baseValue: 58 },
    { rank: 53, name: 'Jonathon Brooks',       position: 'RB',  team: 'CAR', age: 22, baseValue: 55 },
    { rank: 54, name: 'Harrison Butker',       position: 'K',   team: 'KC',  age: 30, baseValue: 52 },
    { rank: 55, name: 'Brandon Aubrey',        position: 'K',   team: 'DAL', age: 29, baseValue: 50 },
    { rank: 56, name: 'San Francisco DEF',     position: 'DEF', team: 'SF',  age:  0, baseValue: 48 },
    { rank: 57, name: 'Dallas DEF',            position: 'DEF', team: 'DAL', age:  0, baseValue: 45 },
    { rank: 58, name: "Ka'imi Fairbairn",      position: 'K',   team: 'HOU', age: 32, baseValue: 42 },
    { rank: 59, name: 'Baltimore DEF',         position: 'DEF', team: 'BAL', age:  0, baseValue: 40 },
    { rank: 60, name: 'Jake Moody',            position: 'K',   team: 'SF',  age: 26, baseValue: 38 },

    // ── RANKS 61–120 ─────────────────────────────────────────────────────────
    { rank:  61, name: 'Justin Jefferson',     position: 'WR',  team: 'MIN', age: 26, baseValue: 93 },
    { rank:  62, name: 'Christian McCaffrey',  position: 'RB',  team: 'SF',  age: 28, baseValue: 91 },
    { rank:  63, name: 'Caleb Williams',       position: 'QB',  team: 'CHI', age: 23, baseValue: 76 },
    { rank:  64, name: 'Jake Ferguson',        position: 'TE',  team: 'DAL', age: 25, baseValue: 61 },
    { rank:  65, name: 'Evan Engram',          position: 'TE',  team: 'JAX', age: 31, baseValue: 60 },
    { rank:  66, name: "Ja'Tavion Sanders",    position: 'TE',  team: 'CAR', age: 23, baseValue: 54 },
    { rank:  67, name: 'Xavier Worthy',        position: 'WR',  team: 'KC',  age: 22, baseValue: 67 },
    { rank:  68, name: 'Deebo Samuel',         position: 'WR',  team: 'SF',  age: 29, baseValue: 63 },
    { rank:  69, name: 'Keon Coleman',         position: 'WR',  team: 'BUF', age: 23, baseValue: 64 },
    { rank:  70, name: 'Jordan Love',          position: 'QB',  team: 'GB',  age: 27, baseValue: 76 },
    { rank:  71, name: 'Dak Prescott',         position: 'QB',  team: 'DAL', age: 32, baseValue: 75 },
    { rank:  72, name: "D'Andre Swift",        position: 'RB',  team: 'CHI', age: 26, baseValue: 63 },
    { rank:  73, name: 'Chuba Hubbard',        position: 'RB',  team: 'CAR', age: 25, baseValue: 61 },
    { rank:  74, name: 'Tank Dell',            position: 'WR',  team: 'HOU', age: 25, baseValue: 66 },
    { rank:  75, name: 'Davante Adams',        position: 'WR',  team: 'FA',  age: 33, baseValue: 62 },
    { rank:  76, name: 'Rashee Rice',          position: 'WR',  team: 'KC',  age: 24, baseValue: 70 },
    { rank:  77, name: 'Rome Odunze',          position: 'WR',  team: 'CHI', age: 23, baseValue: 68 },
    { rank:  78, name: 'Alvin Kamara',         position: 'RB',  team: 'NO',  age: 30, baseValue: 62 },
    { rank:  79, name: 'Tony Pollard',         position: 'RB',  team: 'TEN', age: 28, baseValue: 59 },
    { rank:  80, name: 'Jayden Reed',          position: 'WR',  team: 'GB',  age: 25, baseValue: 67 },
    { rank:  81, name: 'Christian Watson',     position: 'WR',  team: 'GB',  age: 25, baseValue: 63 },
    { rank:  82, name: 'Jameson Williams',     position: 'WR',  team: 'DET', age: 23, baseValue: 68 },
    { rank:  83, name: 'Michael Pittman Jr',   position: 'WR',  team: 'IND', age: 27, baseValue: 64 },
    { rank:  84, name: 'Stefon Diggs',         position: 'WR',  team: 'HOU', age: 32, baseValue: 61 },
    { rank:  85, name: 'Quentin Johnston',     position: 'WR',  team: 'LAC', age: 23, baseValue: 63 },
    { rank:  86, name: 'Javonte Williams',     position: 'RB',  team: 'DEN', age: 25, baseValue: 60 },
    { rank:  87, name: 'Ezekiel Elliott',      position: 'RB',  team: 'DAL', age: 30, baseValue: 53 },
    { rank:  88, name: 'Tyler Lockett',        position: 'WR',  team: 'SEA', age: 33, baseValue: 56 },
    { rank:  89, name: 'Curtis Samuel',        position: 'WR',  team: 'BUF', age: 29, baseValue: 55 },
    { rank:  90, name: 'Elijah Moore',         position: 'WR',  team: 'CLE', age: 25, baseValue: 58 },
    { rank:  91, name: 'Sam Darnold',          position: 'QB',  team: 'MIN', age: 28, baseValue: 70 },
    { rank:  92, name: 'Gus Edwards',          position: 'RB',  team: 'LAC', age: 30, baseValue: 55 },
    { rank:  93, name: 'Zach Charbonnet',      position: 'RB',  team: 'SEA', age: 24, baseValue: 61 },
    { rank:  94, name: 'Miles Sanders',        position: 'RB',  team: 'CAR', age: 28, baseValue: 52 },
    { rank:  95, name: 'Tyjae Spears',         position: 'RB',  team: 'TEN', age: 24, baseValue: 59 },
    { rank:  96, name: 'Amari Cooper',         position: 'WR',  team: 'BUF', age: 31, baseValue: 60 },
    { rank:  97, name: 'Treylon Burks',        position: 'WR',  team: 'TEN', age: 25, baseValue: 57 },
    { rank:  98, name: 'Wan\'Dale Robinson',   position: 'WR',  team: 'NYG', age: 24, baseValue: 60 },
    { rank:  99, name: 'Jerome Ford',          position: 'RB',  team: 'CLE', age: 25, baseValue: 58 },
    { rank: 100, name: 'Antonio Gibson',       position: 'RB',  team: 'NE',  age: 27, baseValue: 54 },
    { rank: 101, name: 'Bo Nix',              position: 'QB',  team: 'DEN', age: 25, baseValue: 71 },
    { rank: 102, name: 'Bryce Young',         position: 'QB',  team: 'CAR', age: 24, baseValue: 67 },
    { rank: 103, name: 'C.J. Uzomah',         position: 'TE',  team: 'NYJ', age: 32, baseValue: 47 },
    { rank: 104, name: 'Hunter Henry',        position: 'TE',  team: 'NE',  age: 30, baseValue: 48 },
    { rank: 105, name: 'Greg Dulcich',        position: 'TE',  team: 'DEN', age: 25, baseValue: 49 },
    { rank: 106, name: 'Jonnu Smith',         position: 'TE',  team: 'MIA', age: 30, baseValue: 50 },
    { rank: 107, name: 'Tyler Conklin',       position: 'TE',  team: 'NYJ', age: 30, baseValue: 46 },
    { rank: 108, name: 'Chigoziem Okonkwo',   position: 'TE',  team: 'TEN', age: 26, baseValue: 52 },
    { rank: 109, name: 'Isaiah Likely',       position: 'TE',  team: 'BAL', age: 25, baseValue: 55 },
    { rank: 110, name: 'Tucker Kraft',        position: 'TE',  team: 'GB',  age: 24, baseValue: 53 },
    { rank: 111, name: 'Michael Mayer',       position: 'TE',  team: 'LV',  age: 23, baseValue: 51 },
    { rank: 112, name: 'Luke Musgrave',       position: 'TE',  team: 'GB',  age: 25, baseValue: 50 },
    { rank: 113, name: 'Brenton Strange',     position: 'TE',  team: 'JAX', age: 25, baseValue: 48 },
    { rank: 114, name: 'Noah Fant',           position: 'TE',  team: 'SEA', age: 28, baseValue: 49 },
    { rank: 115, name: 'Cole Kmet',           position: 'TE',  team: 'CHI', age: 26, baseValue: 54 },
    { rank: 116, name: 'Pat Freiermuth',      position: 'TE',  team: 'PIT', age: 26, baseValue: 53 },
    { rank: 117, name: 'Will Dissly',         position: 'TE',  team: 'LAC', age: 29, baseValue: 45 },
    { rank: 118, name: 'Dawson Knox',         position: 'TE',  team: 'BUF', age: 28, baseValue: 50 },
    { rank: 119, name: 'Foster Moreau',       position: 'TE',  team: 'NO',  age: 28, baseValue: 46 },
    { rank: 120, name: 'Ben Sinnott',         position: 'TE',  team: 'WSH', age: 24, baseValue: 51 },

    // ── RANKS 121–180 ────────────────────────────────────────────────────────
    { rank: 121, name: 'C.J. Stroud',         position: 'QB',  team: 'HOU', age: 24, baseValue: 78 },
    { rank: 122, name: 'Khalil Shakir',       position: 'WR',  team: 'BUF', age: 25, baseValue: 62 },
    { rank: 123, name: 'Cedric Tillman',      position: 'WR',  team: 'CLE', age: 25, baseValue: 58 },
    { rank: 124, name: 'Courtland Sutton',    position: 'WR',  team: 'DEN', age: 29, baseValue: 60 },
    { rank: 125, name: 'Diontae Johnson',     position: 'WR',  team: 'HOU', age: 29, baseValue: 58 },
    { rank: 126, name: 'Jaxon Smith-Njigba',  position: 'WR',  team: 'SEA', age: 23, baseValue: 65 },
    { rank: 127, name: 'Brandin Cooks',       position: 'WR',  team: 'DAL', age: 32, baseValue: 55 },
    { rank: 128, name: 'Adam Thielen',        position: 'WR',  team: 'CAR', age: 35, baseValue: 47 },
    { rank: 129, name: 'DJ Moore',            position: 'WR',  team: 'CHI', age: 28, baseValue: 63 },
    { rank: 130, name: 'Dontayvion Wicks',    position: 'WR',  team: 'GB',  age: 24, baseValue: 59 },
    { rank: 131, name: 'Elijah Mitchell',     position: 'RB',  team: 'SF',  age: 27, baseValue: 56 },
    { rank: 132, name: 'Kareem Hunt',         position: 'RB',  team: 'KC',  age: 30, baseValue: 54 },
    { rank: 133, name: 'Dameon Pierce',       position: 'RB',  team: 'HOU', age: 25, baseValue: 57 },
    { rank: 134, name: 'Khalil Herbert',      position: 'RB',  team: 'CHI', age: 26, baseValue: 55 },
    { rank: 135, name: 'Alexander Mattison',  position: 'RB',  team: 'MIN', age: 27, baseValue: 56 },
    { rank: 136, name: 'Roschon Johnson',     position: 'RB',  team: 'CHI', age: 24, baseValue: 55 },
    { rank: 137, name: 'Hassan Haskins',      position: 'RB',  team: 'LAR', age: 26, baseValue: 50 },
    { rank: 138, name: 'Tyler Allgeier',      position: 'RB',  team: 'ATL', age: 24, baseValue: 57 },
    { rank: 139, name: 'Pierre Strong Jr',    position: 'RB',  team: 'CLE', age: 25, baseValue: 51 },
    { rank: 140, name: 'Trey Sermon',         position: 'RB',  team: 'TEN', age: 26, baseValue: 50 },
    { rank: 141, name: 'Tank Bigsby',         position: 'RB',  team: 'JAX', age: 23, baseValue: 58 },
    { rank: 142, name: 'Deuce Vaughn',        position: 'RB',  team: 'DAL', age: 24, baseValue: 50 },
    { rank: 143, name: 'Rico Dowdle',         position: 'RB',  team: 'DAL', age: 26, baseValue: 55 },
    { rank: 144, name: 'Jaylen Warren',       position: 'RB',  team: 'PIT', age: 26, baseValue: 54 },
    { rank: 145, name: 'Patrick Taylor',      position: 'RB',  team: 'GB',  age: 27, baseValue: 48 },
    { rank: 146, name: 'Cam Akers',           position: 'RB',  team: 'MIN', age: 25, baseValue: 52 },
    { rank: 147, name: 'Zamir White',         position: 'RB',  team: 'LV',  age: 25, baseValue: 54 },
    { rank: 148, name: 'Darnell Mooney',      position: 'WR',  team: 'ATL', age: 27, baseValue: 59 },
    { rank: 149, name: 'Odell Beckham Jr',    position: 'WR',  team: 'MIA', age: 33, baseValue: 50 },
    { rank: 150, name: 'Michael Wilson',      position: 'WR',  team: 'ARI', age: 25, baseValue: 57 },
    { rank: 151, name: 'Joshua Palmer',       position: 'WR',  team: 'LAC', age: 25, baseValue: 58 },
    { rank: 152, name: 'Rashod Bateman',      position: 'WR',  team: 'BAL', age: 25, baseValue: 57 },
    { rank: 153, name: 'Rondale Moore',       position: 'WR',  team: 'ARI', age: 25, baseValue: 55 },
    { rank: 154, name: 'Demarcus Robinson',   position: 'WR',  team: 'LAR', age: 30, baseValue: 51 },
    { rank: 155, name: 'Nelson Agholor',      position: 'WR',  team: 'NE',  age: 32, baseValue: 48 },
    { rank: 156, name: 'Jerry Jeudy',         position: 'WR',  team: 'CLE', age: 26, baseValue: 59 },
    { rank: 157, name: 'Allen Robinson II',   position: 'WR',  team: 'PIT', age: 32, baseValue: 48 },
    { rank: 158, name: 'Van Jefferson',       position: 'WR',  team: 'ATL', age: 28, baseValue: 52 },
    { rank: 159, name: 'Kadarius Toney',      position: 'WR',  team: 'KC',  age: 26, baseValue: 53 },
    { rank: 160, name: 'Parris Campbell',     position: 'WR',  team: 'PIT', age: 29, baseValue: 50 },
    { rank: 161, name: 'Donovan Peoples-Jones',position:'WR',  team: 'DET', age: 26, baseValue: 55 },
    { rank: 162, name: 'Jordan Addison',      position: 'WR',  team: 'MIN', age: 23, baseValue: 65 },
    { rank: 163, name: 'George Pickens',      position: 'WR',  team: 'PIT', age: 24, baseValue: 68 },
    { rank: 164, name: 'Dalton Schultz',      position: 'TE',  team: 'HOU', age: 30, baseValue: 48 },
    { rank: 165, name: 'Tyler Higbee',        position: 'TE',  team: 'LAR', age: 31, baseValue: 47 },
    { rank: 166, name: 'Hayden Hurst',        position: 'TE',  team: 'CAR', age: 32, baseValue: 44 },
    { rank: 167, name: 'T.J. Hockenson',      position: 'TE',  team: 'MIN', age: 27, baseValue: 56 },
    { rank: 168, name: 'David Njoku',         position: 'TE',  team: 'CLE', age: 28, baseValue: 55 },
    { rank: 169, name: 'Mike Gesicki',        position: 'TE',  team: 'NE',  age: 29, baseValue: 48 },
    { rank: 170, name: 'Mo Alie-Cox',         position: 'TE',  team: 'IND', age: 30, baseValue: 43 },
    { rank: 171, name: 'Irv Smith Jr',        position: 'TE',  team: 'CIN', age: 28, baseValue: 47 },
    { rank: 172, name: 'Juwan Johnson',       position: 'TE',  team: 'NO',  age: 28, baseValue: 46 },
    { rank: 173, name: 'Durham Smythe',       position: 'TE',  team: 'MIA', age: 29, baseValue: 42 },
    { rank: 174, name: 'Gerald Everett',      position: 'TE',  team: 'LAC', age: 30, baseValue: 45 },
    { rank: 175, name: 'Cade Otton',          position: 'TE',  team: 'TB',  age: 25, baseValue: 50 },
    { rank: 176, name: 'Lawrence Cager',      position: 'TE',  team: 'NYG', age: 28, baseValue: 41 },
    { rank: 177, name: 'Logan Thomas',        position: 'TE',  team: 'WSH', age: 34, baseValue: 40 },
    { rank: 178, name: 'Kylen Granson',       position: 'TE',  team: 'IND', age: 27, baseValue: 44 },
    { rank: 179, name: 'Drew Sample',         position: 'TE',  team: 'CIN', age: 28, baseValue: 41 },
    { rank: 180, name: 'Adam Trautman',       position: 'TE',  team: 'DEN', age: 28, baseValue: 42 },

    // ── RANKS 181–240 ────────────────────────────────────────────────────────
    { rank: 181, name: 'Geno Smith',          position: 'QB',  team: 'SEA', age: 35, baseValue: 65 },
    { rank: 182, name: 'Baker Mayfield',      position: 'QB',  team: 'TB',  age: 30, baseValue: 68 },
    { rank: 183, name: 'Derek Carr',          position: 'QB',  team: 'NO',  age: 34, baseValue: 63 },
    { rank: 184, name: 'Justin Fields',       position: 'QB',  team: 'PIT', age: 26, baseValue: 67 },
    { rank: 185, name: 'Tua Tagovailoa',      position: 'QB',  team: 'MIA', age: 27, baseValue: 72 },
    { rank: 186, name: 'Kirk Cousins',        position: 'QB',  team: 'ATL', age: 37, baseValue: 66 },
    { rank: 187, name: 'Matthew Stafford',    position: 'QB',  team: 'LAR', age: 37, baseValue: 64 },
    { rank: 188, name: 'Russell Wilson',      position: 'QB',  team: 'PIT', age: 37, baseValue: 63 },
    { rank: 189, name: 'Trevor Lawrence',     position: 'QB',  team: 'JAX', age: 26, baseValue: 73 },
    { rank: 190, name: 'Deshaun Watson',      position: 'QB',  team: 'CLE', age: 30, baseValue: 65 },
    { rank: 191, name: 'Zach Wilson',         position: 'QB',  team: 'DEN', age: 26, baseValue: 60 },
    { rank: 192, name: 'Kenny Pickett',       position: 'QB',  team: 'PHI', age: 27, baseValue: 61 },
    { rank: 193, name: 'Marcus Mariota',      position: 'QB',  team: 'PHI', age: 32, baseValue: 57 },
    { rank: 194, name: 'Aidan O\'Connell',   position: 'QB',  team: 'LV',  age: 26, baseValue: 59 },
    { rank: 195, name: 'Gardner Minshew',     position: 'QB',  team: 'LV',  age: 29, baseValue: 58 },
    { rank: 196, name: 'Will Levis',          position: 'QB',  team: 'TEN', age: 26, baseValue: 63 },
    { rank: 197, name: 'Tyson Bagent',        position: 'QB',  team: 'CHI', age: 25, baseValue: 55 },
    { rank: 198, name: 'Joshua Dobbs',        position: 'QB',  team: 'SF',  age: 30, baseValue: 53 },
    { rank: 199, name: 'Malik Willis',        position: 'QB',  team: 'TEN', age: 26, baseValue: 57 },
    { rank: 200, name: 'Taylor Heinicke',     position: 'QB',  team: 'ATL', age: 31, baseValue: 54 },
    { rank: 201, name: 'Raheem Mostert',      position: 'RB',  team: 'MIA', age: 33, baseValue: 50 },
    { rank: 202, name: 'Samaje Perine',       position: 'RB',  team: 'DEN', age: 29, baseValue: 50 },
    { rank: 203, name: 'Ty Chandler',         position: 'RB',  team: 'MIN', age: 25, baseValue: 51 },
    { rank: 204, name: 'Jaleel McLaughlin',   position: 'RB',  team: 'DEN', age: 25, baseValue: 52 },
    { rank: 205, name: 'Travis Homer',        position: 'RB',  team: 'CHI', age: 28, baseValue: 47 },
    { rank: 206, name: 'Latavius Murray',     position: 'RB',  team: 'BUF', age: 35, baseValue: 42 },
    { rank: 207, name: 'Clyde Edwards-Helaire',position:'RB',  team: 'KC',  age: 26, baseValue: 53 },
    { rank: 208, name: 'D\'Onta Foreman',     position: 'RB',  team: 'CHI', age: 28, baseValue: 48 },
    { rank: 209, name: 'Deon Jackson',        position: 'RB',  team: 'IND', age: 27, baseValue: 46 },
    { rank: 210, name: 'Kenyan Drake',        position: 'RB',  team: 'BUF', age: 31, baseValue: 44 },
    { rank: 211, name: 'Emanuel Wilson',      position: 'RB',  team: 'GB',  age: 25, baseValue: 50 },
    { rank: 212, name: 'Boston Scott',        position: 'RB',  team: 'PHI', age: 30, baseValue: 43 },
    { rank: 213, name: 'Eno Benjamin',        position: 'RB',  team: 'ARI', age: 26, baseValue: 47 },
    { rank: 214, name: 'Keith Smith',         position: 'RB',  team: 'ATL', age: 31, baseValue: 40 },
    { rank: 215, name: 'Joshua Kelley',       position: 'RB',  team: 'LAC', age: 27, baseValue: 46 },
    { rank: 216, name: 'Justice Hill',        position: 'RB',  team: 'BAL', age: 27, baseValue: 48 },
    { rank: 217, name: 'Cordarrelle Patterson',position:'RB',  team: 'PIT', age: 33, baseValue: 43 },
    { rank: 218, name: 'Duke Johnson',        position: 'RB',  team: 'HOU', age: 31, baseValue: 41 },
    { rank: 219, name: 'Dwayne Washington',   position: 'RB',  team: 'NO',  age: 30, baseValue: 40 },
    { rank: 220, name: 'Mike Boone',          position: 'RB',  team: 'DEN', age: 30, baseValue: 42 },
    { rank: 221, name: 'Arik Gilbert',        position: 'TE',  team: 'GB',  age: 23, baseValue: 46 },
    { rank: 222, name: 'Pharaoh Brown',       position: 'TE',  team: 'HOU', age: 30, baseValue: 41 },
    { rank: 223, name: 'Ian Thomas',          position: 'TE',  team: 'CAR', age: 27, baseValue: 42 },
    { rank: 224, name: 'Nick Vannett',        position: 'TE',  team: 'NO',  age: 32, baseValue: 40 },
    { rank: 225, name: 'Zach Ertz',           position: 'TE',  team: 'WSH', age: 34, baseValue: 43 },
    { rank: 226, name: 'Robert Tonyan',       position: 'TE',  team: 'MIN', age: 31, baseValue: 44 },
    { rank: 227, name: 'Tanner Hudson',       position: 'TE',  team: 'BUF', age: 29, baseValue: 42 },
    { rank: 228, name: 'Kenny Yeboah',        position: 'TE',  team: 'NYJ', age: 26, baseValue: 43 },
    { rank: 229, name: 'Teagan Quitoriano',   position: 'TE',  team: 'HOU', age: 25, baseValue: 44 },
    { rank: 230, name: 'Josh Oliver',         position: 'TE',  team: 'MIN', age: 28, baseValue: 41 },
    { rank: 231, name: 'Parker Washington',   position: 'WR',  team: 'PIT', age: 24, baseValue: 55 },
    { rank: 232, name: 'Chase Claypool',      position: 'WR',  team: 'MIA', age: 26, baseValue: 52 },
    { rank: 233, name: 'Mecole Hardman',      position: 'WR',  team: 'KC',  age: 27, baseValue: 53 },
    { rank: 234, name: 'JuJu Smith-Schuster', position: 'WR',  team: 'NE',  age: 29, baseValue: 50 },
    { rank: 235, name: 'Jalen Tolbert',       position: 'WR',  team: 'DAL', age: 26, baseValue: 53 },
    { rank: 236, name: 'Greg Dortch',         position: 'WR',  team: 'ARI', age: 28, baseValue: 51 },
    { rank: 237, name: 'Marquez Valdes-Scantling',position:'WR',team:'NO',  age: 30, baseValue: 50 },
    { rank: 238, name: 'Andrel Anthony',      position: 'WR',  team: 'CIN', age: 23, baseValue: 54 },
    { rank: 239, name: 'Velus Jones Jr',      position: 'WR',  team: 'CHI', age: 27, baseValue: 50 },
    { rank: 240, name: 'Kendall Hinton',      position: 'WR',  team: 'DEN', age: 27, baseValue: 48 },

    // ── RANKS 241–300 ────────────────────────────────────────────────────────
    { rank: 241, name: 'Evan McPherson',      position: 'K',   team: 'CIN', age: 26, baseValue: 46 },
    { rank: 242, name: 'Jake Elliott',        position: 'K',   team: 'PHI', age: 30, baseValue: 45 },
    { rank: 243, name: 'Tyler Bass',          position: 'K',   team: 'BUF', age: 28, baseValue: 44 },
    { rank: 244, name: 'Chris Boswell',       position: 'K',   team: 'PIT', age: 33, baseValue: 43 },
    { rank: 245, name: 'Younghoe Koo',        position: 'K',   team: 'ATL', age: 31, baseValue: 43 },
    { rank: 246, name: 'Jason Sanders',       position: 'K',   team: 'MIA', age: 29, baseValue: 42 },
    { rank: 247, name: 'Cameron Dicker',      position: 'K',   team: 'LAC', age: 26, baseValue: 42 },
    { rank: 248, name: 'Greg Joseph',         position: 'K',   team: 'MIN', age: 31, baseValue: 41 },
    { rank: 249, name: 'Nick Folk',           position: 'K',   team: 'TEN', age: 40, baseValue: 38 },
    { rank: 250, name: 'Matt Ammendola',      position: 'K',   team: 'NYJ', age: 28, baseValue: 39 },
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
    { rank: 261, name: 'Stefon Diggs',        position: 'WR',  team: 'HOU', age: 32, baseValue: 60 },
    { rank: 262, name: 'Trent Sherfield',     position: 'WR',  team: 'MIN', age: 29, baseValue: 48 },
    { rank: 263, name: 'Montrell Washington', position: 'WR',  team: 'DEN', age: 25, baseValue: 50 },
    { rank: 264, name: 'Ray-Ray McCloud',     position: 'WR',  team: 'SF',  age: 28, baseValue: 45 },
    { rank: 265, name: 'Laquon Treadwell',    position: 'WR',  team: 'JAX', age: 29, baseValue: 46 },
    { rank: 266, name: 'Byron Pringle',       position: 'WR',  team: 'CHI', age: 31, baseValue: 43 },
    { rank: 267, name: 'Damiere Byrd',        position: 'WR',  team: 'ATL', age: 31, baseValue: 43 },
    { rank: 268, name: 'Malik Turner',        position: 'WR',  team: 'CHI', age: 30, baseValue: 42 },
    { rank: 269, name: 'John Ross',           position: 'WR',  team: 'WSH', age: 29, baseValue: 42 },
    { rank: 270, name: 'Freddie Swain',       position: 'WR',  team: 'SEA', age: 27, baseValue: 41 },
    { rank: 271, name: 'Jamari Thrash',       position: 'WR',  team: 'CLE', age: 24, baseValue: 52 },
    { rank: 272, name: 'Tutu Atwell',         position: 'WR',  team: 'LAR', age: 24, baseValue: 53 },
    { rank: 273, name: 'Elijah Higgins',      position: 'WR',  team: 'ARI', age: 24, baseValue: 51 },
    { rank: 274, name: 'Rashee Rice',         position: 'WR',  team: 'KC',  age: 24, baseValue: 70 },
    { rank: 275, name: 'Devaughn Vele',       position: 'WR',  team: 'DEN', age: 24, baseValue: 52 },
    { rank: 276, name: 'Luke McCaffrey',      position: 'WR',  team: 'WSH', age: 23, baseValue: 54 },
    { rank: 277, name: 'Jalen McMillan',      position: 'WR',  team: 'TB',  age: 23, baseValue: 55 },
    { rank: 278, name: 'Adonai Mitchell',     position: 'WR',  team: 'IND', age: 22, baseValue: 57 },
    { rank: 279, name: 'Ricky Pearsall',      position: 'WR',  team: 'SF',  age: 24, baseValue: 56 },
    { rank: 280, name: 'Xavier Legette',      position: 'WR',  team: 'CAR', age: 24, baseValue: 55 },
    { rank: 281, name: 'Ray Davis',           position: 'RB',  team: 'BUF', age: 25, baseValue: 53 },
    { rank: 282, name: 'Audric Estime',       position: 'RB',  team: 'DEN', age: 22, baseValue: 54 },
    { rank: 283, name: 'MarShawn Lloyd',      position: 'RB',  team: 'GB',  age: 23, baseValue: 52 },
    { rank: 284, name: 'Blake Corum',         position: 'RB',  team: 'LAR', age: 23, baseValue: 53 },
    { rank: 285, name: 'Will Shipley',        position: 'RB',  team: 'PHI', age: 23, baseValue: 52 },
    { rank: 286, name: 'Braelon Allen',       position: 'RB',  team: 'NYJ', age: 21, baseValue: 55 },
    { rank: 287, name: 'Kimani Vidal',        position: 'RB',  team: 'LAC', age: 23, baseValue: 51 },
    { rank: 288, name: 'Dylan Laube',         position: 'RB',  team: 'LV',  age: 24, baseValue: 50 },
    { rank: 289, name: 'Isaac Guerendo',      position: 'RB',  team: 'SF',  age: 25, baseValue: 54 },
    { rank: 290, name: 'Quinshon Judkins',    position: 'RB',  team: 'CLE', age: 21, baseValue: 55 },
    { rank: 291, name: 'Rhamondre Stevenson',  position: 'RB',  team: 'FA',  age: 27, baseValue: 48 },
    { rank: 292, name: 'Cody Schrader',       position: 'RB',  team: 'LA',  age: 25, baseValue: 48 },
    { rank: 293, name: 'Tyrone Tracy Jr',     position: 'RB',  team: 'NYG', age: 24, baseValue: 54 },
    { rank: 294, name: 'Keaton Mitchell',      position: 'RB',  team: 'BAL', age: 23, baseValue: 51 },
    { rank: 295, name: 'Spencer Sanders',     position: 'QB',  team: 'CAR', age: 26, baseValue: 50 },
    { rank: 296, name: 'Tommy DeVito',        position: 'QB',  team: 'NYG', age: 26, baseValue: 50 },
    { rank: 297, name: 'Easton Stick',        position: 'QB',  team: 'LAC', age: 29, baseValue: 48 },
    { rank: 298, name: 'Jacoby Brissett',     position: 'QB',  team: 'NE',  age: 32, baseValue: 49 },
    { rank: 299, name: 'Brandon Allen',       position: 'QB',  team: 'CIN', age: 32, baseValue: 46 },
    { rank: 300, name: 'Trace McSorley',      position: 'QB',  team: 'ARI', age: 29, baseValue: 45 },
];
