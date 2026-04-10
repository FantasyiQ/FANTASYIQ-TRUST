// Dynamic Trade Value (DTV) engine
// Formula: ROUND(baseValue * scarcityMult * ageFactor, 1) + (catchRateFactor * pprValue)

export interface Player {
    name: string;
    position: string;
    team: string;
    age: number;
    baseValue: number;
}

export interface DtvResult extends Player {
    scarcityMult: number;
    ageFactor: number;
    dtv: number;
    catchRateFactor: number;
    pprBoost: number;
    finalDtv: number;
    tier: string;
}

export type PprFormat = 0 | 0.5 | 1;

const SCARCITY: Record<string, number> = {
    QB: 0.95,
    RB: 1.25,
    WR: 1.20,
    TE: 1.10,
    K:  0.85,
    DEF: 0.85,
};

const CATCH_RATE: Record<string, number> = {
    RB: 0.5,
    WR: 1.0,
    TE: 0.8,
    QB: 0,
    K:  0,
    DEF: 0,
};

function ageFactor(position: string, age: number): number {
    if (position === 'K' || position === 'DEF') return 1;
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

export function calcDtv(player: Player, ppr: PprFormat = 1): DtvResult {
    const scarcityMult   = SCARCITY[player.position] ?? 1;
    const age            = ageFactor(player.position, player.age);
    const dtv            = Math.round(player.baseValue * scarcityMult * age * 10) / 10;
    const catchRateFactor = CATCH_RATE[player.position] ?? 0;
    const pprBoost       = catchRateFactor * ppr;
    const finalDtv       = Math.round((dtv + pprBoost) * 10) / 10;

    return {
        ...player,
        scarcityMult,
        ageFactor: age,
        dtv,
        catchRateFactor,
        pprBoost,
        finalDtv,
        tier: tier(finalDtv),
    };
}

export function evaluateTrade(
    sideA: Player[],
    sideB: Player[],
    ppr: PprFormat = 1,
): {
    sideA: DtvResult[];
    sideB: DtvResult[];
    totalA: number;
    totalB: number;
    diff: number;
    winner: 'A' | 'B' | 'Even';
    fairness: 'Fair' | 'Slight Edge' | 'Lopsided' | 'Robbery';
} {
    const a = sideA.map(p => calcDtv(p, ppr));
    const b = sideB.map(p => calcDtv(p, ppr));
    const totalA = Math.round(a.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
    const totalB = Math.round(b.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
    const diff   = Math.abs(totalA - totalB);
    const winner: 'A' | 'B' | 'Even' = diff < 2 ? 'Even' : totalA > totalB ? 'A' : 'B';
    const fairness: 'Fair' | 'Slight Edge' | 'Lopsided' | 'Robbery' =
        diff < 5   ? 'Fair' :
        diff < 15  ? 'Slight Edge' :
        diff < 30  ? 'Lopsided' : 'Robbery';

    return { sideA: a, sideB: b, totalA, totalB, diff, winner, fairness };
}

// Full player list with base values from the trade chart
export const PLAYERS: Player[] = [
    { name: 'Patrick Mahomes',    position: 'QB',  team: 'KC',   age: 29, baseValue: 95 },
    { name: 'Josh Allen',         position: 'QB',  team: 'BUF',  age: 30, baseValue: 93 },
    { name: 'Lamar Jackson',      position: 'QB',  team: 'BAL',  age: 29, baseValue: 92 },
    { name: 'Jalen Hurts',        position: 'QB',  team: 'PHI',  age: 27, baseValue: 89 },
    { name: 'Joe Burrow',         position: 'QB',  team: 'CIN',  age: 29, baseValue: 88 },
    { name: 'CJ Stroud',          position: 'QB',  team: 'HOU',  age: 23, baseValue: 85 },
    { name: 'Anthony Richardson', position: 'QB',  team: 'IND',  age: 23, baseValue: 82 },
    { name: 'Caleb Williams',     position: 'QB',  team: 'CHI',  age: 23, baseValue: 80 },
    { name: 'Jayden Daniels',     position: 'QB',  team: 'WAS',  age: 24, baseValue: 83 },
    { name: 'Dak Prescott',       position: 'QB',  team: 'DAL',  age: 32, baseValue: 78 },
    { name: 'Christian McCaffrey',position: 'RB',  team: 'SF',   age: 28, baseValue: 94 },
    { name: 'Breece Hall',        position: 'RB',  team: 'NYJ',  age: 23, baseValue: 89 },
    { name: 'Bijan Robinson',     position: 'RB',  team: 'ATL',  age: 23, baseValue: 87 },
    { name: 'Jonathan Taylor',    position: 'RB',  team: 'IND',  age: 26, baseValue: 85 },
    { name: 'Josh Jacobs',        position: 'RB',  team: 'GB',   age: 28, baseValue: 86 },
    { name: 'De\'Von Achane',     position: 'RB',  team: 'MIA',  age: 23, baseValue: 82 },
    { name: 'Saquon Barkley',     position: 'RB',  team: 'PHI',  age: 28, baseValue: 85 },
    { name: 'Derrick Henry',      position: 'RB',  team: 'BAL',  age: 31, baseValue: 80 },
    { name: 'Tony Pollard',       position: 'RB',  team: 'TEN',  age: 27, baseValue: 78 },
    { name: 'Jahmyr Gibbs',       position: 'RB',  team: 'DET',  age: 23, baseValue: 84 },
    { name: 'Tyreek Hill',        position: 'WR',  team: 'MIA',  age: 31, baseValue: 93 },
    { name: 'Justin Jefferson',   position: 'WR',  team: 'MIN',  age: 26, baseValue: 96 },
    { name: 'CeeDee Lamb',        position: 'WR',  team: 'DAL',  age: 25, baseValue: 95 },
    { name: 'Ja\'Marr Chase',     position: 'WR',  team: 'CIN',  age: 25, baseValue: 94 },
    { name: 'Amon-Ra St. Brown',  position: 'WR',  team: 'DET',  age: 25, baseValue: 90 },
    { name: 'Davante Adams',      position: 'WR',  team: 'NYJ',  age: 32, baseValue: 84 },
    { name: 'Stefon Diggs',       position: 'WR',  team: 'NE',   age: 31, baseValue: 80 },
    { name: 'DJ Moore',           position: 'WR',  team: 'CHI',  age: 27, baseValue: 82 },
    { name: 'Puka Nacua',         position: 'WR',  team: 'LAR',  age: 23, baseValue: 79 },
    { name: 'Garrett Wilson',     position: 'WR',  team: 'NYJ',  age: 25, baseValue: 84 },
    { name: 'Sam LaPorta',        position: 'TE',  team: 'DET',  age: 23, baseValue: 76 },
    { name: 'Travis Kelce',       position: 'TE',  team: 'KC',   age: 35, baseValue: 78 },
    { name: 'Mark Andrews',       position: 'TE',  team: 'BAL',  age: 29, baseValue: 80 },
    { name: 'Trey McBride',       position: 'TE',  team: 'ARI',  age: 24, baseValue: 77 },
    { name: 'Dalton Kincaid',     position: 'TE',  team: 'BUF',  age: 25, baseValue: 72 },
    { name: 'Evan Engram',        position: 'TE',  team: 'JAX',  age: 30, baseValue: 74 },
    { name: 'Jake Ferguson',      position: 'TE',  team: 'DAL',  age: 25, baseValue: 70 },
    { name: 'Ja\'Tavion Sanders', position: 'TE',  team: 'CAR',  age: 22, baseValue: 68 },
    { name: 'Brock Bowers',       position: 'TE',  team: 'LV',   age: 22, baseValue: 82 },
    { name: 'Dawson Knox',        position: 'TE',  team: 'BUF',  age: 28, baseValue: 65 },
    { name: 'Harrison Butker',    position: 'K',   team: 'KC',   age: 29, baseValue: 85 },
    { name: 'Evan McPherson',     position: 'K',   team: 'CIN',  age: 25, baseValue: 80 },
    { name: 'Jake Elliott',       position: 'K',   team: 'PHI',  age: 29, baseValue: 79 },
    { name: 'Brandon Aubrey',     position: 'K',   team: 'DAL',  age: 28, baseValue: 82 },
    { name: 'Tyler Bass',         position: 'K',   team: 'BUF',  age: 27, baseValue: 77 },
    { name: 'Chris Boswell',      position: 'K',   team: 'PIT',  age: 32, baseValue: 78 },
    { name: 'Younghoe Koo',       position: 'K',   team: 'ATL',  age: 30, baseValue: 76 },
    { name: 'Greg Joseph',        position: 'K',   team: 'MIN',  age: 30, baseValue: 74 },
    { name: 'Cameron Dicker',     position: 'K',   team: 'LAC',  age: 25, baseValue: 75 },
    { name: 'Jason Sanders',      position: 'K',   team: 'MIA',  age: 28, baseValue: 73 },
    { name: 'San Francisco 49ers',position: 'DEF', team: 'SF',   age: 0,  baseValue: 80 },
    { name: 'Dallas Cowboys',     position: 'DEF', team: 'DAL',  age: 0,  baseValue: 78 },
    { name: 'Baltimore Ravens',   position: 'DEF', team: 'BAL',  age: 0,  baseValue: 82 },
    { name: 'Cleveland Browns',   position: 'DEF', team: 'CLE',  age: 0,  baseValue: 74 },
    { name: 'Pittsburgh Steelers',position: 'DEF', team: 'PIT',  age: 0,  baseValue: 76 },
    { name: 'New York Jets',      position: 'DEF', team: 'NYJ',  age: 0,  baseValue: 73 },
    { name: 'Buffalo Bills',      position: 'DEF', team: 'BUF',  age: 0,  baseValue: 75 },
    { name: 'Philadelphia Eagles',position: 'DEF', team: 'PHI',  age: 0,  baseValue: 79 },
    { name: 'New England Patriots',position:'DEF', team: 'NE',   age: 0,  baseValue: 70 },
    { name: 'Kansas City Chiefs', position: 'DEF', team: 'KC',   age: 0,  baseValue: 77 },
];
