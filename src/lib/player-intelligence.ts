// FantasyIQ Trust — Player Intelligence Layer
// Provides: per-position age curves, team scheme data, contract tiers, draft capital
// Used by trade-engine.ts to enhance DTV calculations

export type ContractTier = 'rookie' | 'rookie5th' | 'extension' | 'veteran' | 'expiring' | 'franchise' | 'ufa';

// How each contract status impacts dynasty value
export const CONTRACT_MULTIPLIERS: Record<ContractTier, number> = {
    rookie:    1.10,  // cost-controlled, team committed
    rookie5th: 1.06,  // option exercised, known window
    extension: 1.02,  // long-term relationship
    veteran:   0.98,  // market rate, stable
    franchise: 0.96,  // protected but uncertain future
    expiring:  0.93,  // walk-year uncertainty
    ufa:       0.90,  // unsigned / no commitment
};

// 2025 season contract status for top fantasy players
export const PLAYER_CONTRACTS: Record<string, ContractTier> = {
    // ── 2025 Rookie class ──────────────────────────────────────────────────
    "Caleb Williams":     'rookie',
    "Jayden Daniels":     'rookie',
    "Drake Maye":         'rookie',
    "Bo Nix":             'rookie',
    "Malik Nabers":       'rookie',
    "Marvin Harrison Jr": 'rookie',
    "Rome Odunze":        'rookie',
    "Xavier Worthy":      'rookie',
    "Keon Coleman":       'rookie',
    "Ladd McConkey":      'rookie',
    "Brock Bowers":       'rookie',
    "Trey Benson":        'rookie',
    "Blake Corum":        'rookie',
    "Ray Davis":          'rookie',
    "Jonathon Brooks":    'rookie',
    "Braelon Allen":      'rookie',
    "Kimani Vidal":       'rookie',
    "Ja'Lynn Polk":       'rookie',
    "Bucky Irving":       'rookie',

    // ── 2024 Rookie class (2nd year, still on rookie deal) ────────────────
    "Brian Thomas Jr":    'rookie',
    "Malik Willis":       'rookie',
    "Jaxon Smith-Njigba": 'rookie',
    "Sam LaPorta":        'rookie',

    // ── 2023 Rookie class (3rd year, still on rookie deal) ────────────────
    "CJ Stroud":          'rookie5th',  // 5th-year option likely exercised
    "Anthony Richardson": 'rookie',
    "Bijan Robinson":     'rookie',
    "Jahmyr Gibbs":       'rookie',
    "De'Von Achane":      'rookie',
    "Puka Nacua":         'rookie',
    "Tank Dell":          'extension',
    "Rashee Rice":        'extension',

    // ── 2022 Rookie class (on extensions or veteran deals) ────────────────
    "Garrett Wilson":     'extension',
    "Drake London":       'extension',
    "Chris Olave":        'extension',
    "Jameson Williams":   'extension',
    "Kenneth Walker":     'extension',
    "James Cook":         'extension',
    "Kyren Williams":     'extension',
    "George Pickens":     'extension',
    "Breece Hall":        'rookie5th',

    // ── Long-term extensions ───────────────────────────────────────────────
    "Ja'Marr Chase":      'extension',
    "Josh Allen":         'extension',
    "CeeDee Lamb":        'extension',
    "Patrick Mahomes":    'extension',
    "Amon-Ra St. Brown":  'extension',
    "Jalen Hurts":        'extension',
    "Nico Collins":       'extension',
    "Joe Burrow":         'extension',
    "DK Metcalf":         'extension',
    "Trey McBride":       'extension',
    "Travis Etienne":     'extension',
    "Tee Higgins":        'extension',
    "Jaylen Waddle":      'extension',
    "Isiah Pacheco":      'extension',
    "George Kittle":      'extension',
    "Sam Darnold":        'extension',
    "Jordan Love":        'extension',
    "DeVonta Smith":      'extension',
    "Jonathan Taylor":    'extension',
    "Lamar Jackson":      'extension',
    "Brian Robinson Jr":  'extension',
    "Javonte Williams":   'extension',
    "Kyle Pitts":         'extension',
    "Najee Harris":       'extension',
    "Tyler Higbee":       'extension',
    "Dalton Kincaid":     'extension',
    "Luke Musgrave":      'extension',
    "Michael Pittman":    'extension',
    "Courtland Sutton":   'extension',
    "Chris Moore":        'extension',

    // ── Veteran / market-rate ─────────────────────────────────────────────
    "Josh Jacobs":        'veteran',
    "Saquon Barkley":     'veteran',
    "Tyreek Hill":        'ufa',
    "Derrick Henry":      'veteran',
    "Keenan Allen":       'veteran',
    "Davante Adams":      'ufa',
    "Cooper Kupp":        'expiring',
    "Stefon Diggs":       'veteran',
    "Tyler Lockett":      'veteran',
    "Amari Cooper":       'veteran',
    "Hunter Henry":       'veteran',
    "Evan Engram":        'extension',
    "Cole Kmet":          'extension',
    "Dalton Schultz":     'veteran',
    "Zach Ertz":          'veteran',
    "Antonio Gibson":     'veteran',
    "Ezekiel Elliott":    'expiring',
    "Alvin Kamara":       'veteran',
    "Tony Pollard":       'veteran',
    "Diontae Johnson":    'veteran',

    // ── Franchise tagged ─────────────────────────────────────────────────
    // (update as tags happen)
};

// Draft capital score 0–100 (reflects pick slot, not current value)
// Top-5 overall ≈ 95–98, late round ≈ 30–45, UDFA ≈ 20–35
export const PLAYER_DRAFT_CAPITAL: Record<string, number> = {
    // 2024 draft class
    "Caleb Williams":     98,
    "Jayden Daniels":     96,
    "Drake Maye":         95,
    "Marvin Harrison Jr": 93,
    "Malik Nabers":       91,
    "Rome Odunze":        87,
    "Bo Nix":             74,
    "Brian Thomas Jr":    72,
    "Ladd McConkey":      62,
    "Keon Coleman":       62,
    "Brock Bowers":       88,
    "Xavier Worthy":      68,
    "Trey Benson":        65,
    "Blake Corum":        54,
    "Ray Davis":          44,
    "Ja'Lynn Polk":       52,
    "Bucky Irving":       58,
    "Braelon Allen":      60,

    // 2023 draft class
    "CJ Stroud":          91,
    "Anthony Richardson": 85,
    "Bijan Robinson":     88,
    "Jahmyr Gibbs":       87,
    "Jaxon Smith-Njigba": 77,
    "Sam LaPorta":        67,
    "Rashee Rice":        60,
    "Tank Dell":          50,
    "De'Von Achane":      71,
    "Puka Nacua":         34,
    "Jonathon Brooks":    62,

    // 2022 draft class
    "Breece Hall":        82,
    "Garrett Wilson":     88,
    "Drake London":       85,
    "Jameson Williams":   77,
    "Chris Olave":        81,
    "Kenneth Walker":     71,
    "James Cook":         59,
    "Kyren Williams":     54,
    "George Pickens":     71,
    "Jalen Tolbert":      48,

    // 2021 draft class
    "Ja'Marr Chase":      92,
    "Jaylen Waddle":      88,
    "DeVonta Smith":      84,
    "Kyle Pitts":         92,
    "Najee Harris":       81,
    "Javonte Williams":   67,
    "Rashod Bateman":     70,
    "Kadarius Toney":     68,

    // 2020 draft class
    "CeeDee Lamb":        89,
    "Justin Jefferson":   77,
    "Tee Higgins":        74,
    "Jonathan Taylor":    77,
    "Clyde Edwards-Helaire": 80,

    // 2019 draft class
    "Josh Jacobs":        74,
    "DK Metcalf":         71,
    "AJ Brown":           74,
    "Deebo Samuel":       60,
    "Terry McLaurin":     60,

    // QBs
    "Joe Burrow":         95,
    "Jalen Hurts":        67,
    "Sam Darnold":        80,
    "Jordan Love":        77,
    "Patrick Mahomes":    81,
    "Josh Allen":         69,
    "Lamar Jackson":      71,
    "Kyler Murray":       95,
    "Trevor Lawrence":    95,
    "Zach Wilson":        82,
    "Justin Fields":      78,

    // TEs
    "George Kittle":      47,
    "Trey McBride":       59,
    "Evan Engram":        58,
    "Cole Kmet":          58,
    "Dalton Kincaid":     72,
    "Luke Musgrave":      62,
    "Tyler Higbee":       38,
    "Hunter Henry":       50,
    "Zach Ertz":          40,
    "Travis Kelce":       52,

    // Established vets (draft capital less relevant, set to moderate)
    "Tyreek Hill":        41,
    "Stefon Diggs":       50,
    "Keenan Allen":       47,
    "Davante Adams":      46,
    "Cooper Kupp":        60,
    "Tyler Lockett":      42,
    "Amari Cooper":       82,
    "Saquon Barkley":     90,
    "Amon-Ra St. Brown":  54,
    "Nico Collins":       51,
    "Isiah Pacheco":      34,
    "Travis Etienne":     77,
    "Derrick Henry":      71,
};

// ── Team Scheme Data (2025 season) ────────────────────────────────────────
// passRate:       fraction of plays that are passes (0.50–0.70)
// rbCarryShare:   relative carries vs. league avg (1.0 = average)
// teTargetShare:  fraction of targets to the primary TE (0.08–0.25)
// wr1TargetShare: fraction of targets to the WR1 (0.22–0.35)
export interface TeamScheme {
    passRate:       number;
    rbCarryShare:   number;
    teTargetShare:  number;
    wr1TargetShare: number;
}

export const TEAM_SCHEMES: Record<string, TeamScheme> = {
    BUF: { passRate: 0.67, rbCarryShare: 0.80, teTargetShare: 0.10, wr1TargetShare: 0.28 },
    MIA: { passRate: 0.66, rbCarryShare: 0.90, teTargetShare: 0.08, wr1TargetShare: 0.27 },
    NE:  { passRate: 0.55, rbCarryShare: 1.15, teTargetShare: 0.14, wr1TargetShare: 0.24 },
    NYJ: { passRate: 0.60, rbCarryShare: 0.98, teTargetShare: 0.10, wr1TargetShare: 0.28 },
    BAL: { passRate: 0.53, rbCarryShare: 1.32, teTargetShare: 0.14, wr1TargetShare: 0.22 },
    CIN: { passRate: 0.65, rbCarryShare: 0.85, teTargetShare: 0.08, wr1TargetShare: 0.33 },
    CLE: { passRate: 0.57, rbCarryShare: 1.08, teTargetShare: 0.12, wr1TargetShare: 0.26 },
    PIT: { passRate: 0.60, rbCarryShare: 0.96, teTargetShare: 0.12, wr1TargetShare: 0.28 },
    HOU: { passRate: 0.64, rbCarryShare: 0.84, teTargetShare: 0.10, wr1TargetShare: 0.30 },
    IND: { passRate: 0.57, rbCarryShare: 1.08, teTargetShare: 0.10, wr1TargetShare: 0.26 },
    JAX: { passRate: 0.60, rbCarryShare: 0.96, teTargetShare: 0.10, wr1TargetShare: 0.28 },
    TEN: { passRate: 0.55, rbCarryShare: 1.18, teTargetShare: 0.12, wr1TargetShare: 0.26 },
    DEN: { passRate: 0.56, rbCarryShare: 1.12, teTargetShare: 0.12, wr1TargetShare: 0.26 },
    KC:  { passRate: 0.63, rbCarryShare: 0.87, teTargetShare: 0.18, wr1TargetShare: 0.24 },
    LV:  { passRate: 0.58, rbCarryShare: 0.96, teTargetShare: 0.23, wr1TargetShare: 0.22 },
    LAC: { passRate: 0.62, rbCarryShare: 0.88, teTargetShare: 0.12, wr1TargetShare: 0.28 },
    DAL: { passRate: 0.64, rbCarryShare: 0.88, teTargetShare: 0.12, wr1TargetShare: 0.31 },
    NYG: { passRate: 0.57, rbCarryShare: 1.06, teTargetShare: 0.10, wr1TargetShare: 0.28 },
    PHI: { passRate: 0.57, rbCarryShare: 1.06, teTargetShare: 0.12, wr1TargetShare: 0.24 },
    WSH: { passRate: 0.59, rbCarryShare: 0.96, teTargetShare: 0.12, wr1TargetShare: 0.26 },
    CHI: { passRate: 0.59, rbCarryShare: 0.96, teTargetShare: 0.12, wr1TargetShare: 0.26 },
    DET: { passRate: 0.62, rbCarryShare: 0.92, teTargetShare: 0.21, wr1TargetShare: 0.25 },
    GB:  { passRate: 0.62, rbCarryShare: 0.92, teTargetShare: 0.12, wr1TargetShare: 0.26 },
    MIN: { passRate: 0.62, rbCarryShare: 0.90, teTargetShare: 0.10, wr1TargetShare: 0.29 },
    ATL: { passRate: 0.58, rbCarryShare: 1.10, teTargetShare: 0.12, wr1TargetShare: 0.28 },
    CAR: { passRate: 0.56, rbCarryShare: 1.16, teTargetShare: 0.12, wr1TargetShare: 0.26 },
    NO:  { passRate: 0.57, rbCarryShare: 1.06, teTargetShare: 0.12, wr1TargetShare: 0.27 },
    TB:  { passRate: 0.64, rbCarryShare: 0.84, teTargetShare: 0.12, wr1TargetShare: 0.28 },
    ARI: { passRate: 0.60, rbCarryShare: 0.96, teTargetShare: 0.18, wr1TargetShare: 0.26 },
    LAR: { passRate: 0.62, rbCarryShare: 0.90, teTargetShare: 0.14, wr1TargetShare: 0.28 },
    SF:  { passRate: 0.56, rbCarryShare: 1.02, teTargetShare: 0.24, wr1TargetShare: 0.22 },
    SEA: { passRate: 0.60, rbCarryShare: 1.00, teTargetShare: 0.10, wr1TargetShare: 0.28 },
};

// ── Per-position age curves (Dynasty only) ────────────────────────────────
// Redraft uses flat 1.0; Dynasty rewards youth heavily, especially at RB
export function ageCurveDynasty(position: string, age: number): number {
    if (position === 'K' || position === 'DEF' || position === 'PICK') return 1.0;

    switch (position) {
        case 'RB':
            // RB: cliff at 27, near-worthless by 30 in dynasty
            if (age <= 21) return 1.10;
            if (age === 22) return 1.18;
            if (age === 23) return 1.22;
            if (age === 24) return 1.20;
            if (age === 25) return 1.10;
            if (age === 26) return 0.96;
            if (age === 27) return 0.80;
            if (age === 28) return 0.64;
            if (age === 29) return 0.52;
            return 0.42;  // 30+

        case 'WR':
            // WR: peak 24–27, gentle decline, still relevant at 30–31
            if (age <= 21) return 1.10;
            if (age === 22) return 1.18;
            if (age === 23) return 1.23;
            if (age === 24) return 1.26;
            if (age === 25) return 1.26;
            if (age === 26) return 1.22;
            if (age === 27) return 1.14;
            if (age === 28) return 1.04;
            if (age === 29) return 0.92;
            if (age === 30) return 0.80;
            if (age === 31) return 0.70;
            return 0.60;  // 32+

        case 'QB':
            // QB: durable, peak window 27–32, still useful into 34
            if (age <= 23) return 1.05;
            if (age <= 25) return 1.10;
            if (age <= 30) return 1.14;
            if (age <= 32) return 1.10;
            if (age <= 34) return 0.98;
            return 0.88;  // 35+

        case 'TE':
            // TE: peak 25–28, moderate decline
            if (age <= 22) return 1.08;
            if (age <= 24) return 1.16;
            if (age <= 28) return 1.20;
            if (age === 29) return 1.08;
            if (age === 30) return 0.92;
            if (age === 31) return 0.78;
            return 0.66;  // 32+

        default:
            return 1.0;
    }
}

// ── Scheme fit score ───────────────────────────────────────────────────────
// Returns 0.85–1.15 based on how well the team uses this position
export function schemeFitScore(position: string, team: string): number {
    const s = TEAM_SCHEMES[team];
    if (!s) return 1.0;

    const AVG_PASS_RATE = 0.60;
    const AVG_RB_SHARE  = 1.00;
    const AVG_TE_SHARE  = 0.12;
    const AVG_WR1_SHARE = 0.27;

    switch (position) {
        case 'RB': {
            const carryBonus = (s.rbCarryShare - AVG_RB_SHARE) * 0.20;
            const passBonus  = (AVG_PASS_RATE  - s.passRate)   * 0.25;
            return Math.min(1.15, Math.max(0.85, 1.0 + carryBonus + passBonus));
        }
        case 'WR': {
            const passBonus = (s.passRate      - AVG_PASS_RATE)  * 0.60;
            const concBonus = (s.wr1TargetShare - AVG_WR1_SHARE) * 0.40;
            return Math.min(1.15, Math.max(0.85, 1.0 + passBonus + concBonus));
        }
        case 'TE': {
            const teBonus = (s.teTargetShare - AVG_TE_SHARE) * 1.20;
            return Math.min(1.15, Math.max(0.85, 1.0 + teBonus));
        }
        case 'QB': {
            const passBonus = (s.passRate - AVG_PASS_RATE) * 0.60;
            return Math.min(1.10, Math.max(0.90, 1.0 + passBonus));
        }
        default:
            return 1.0;
    }
}

// ── Master intel object ────────────────────────────────────────────────────
export interface PlayerIntel {
    contractTier:   ContractTier | null;
    contractFactor: number;   // ~0.90–1.10
    schemeFit:      number;   // ~0.85–1.15
    draftCapFactor: number;   // ~0.92–1.08
    ageFactor:      number;   // position-aware, ~0.42–1.26
    insights:       string[]; // max 3 badge labels
}

export function getPlayerIntel(
    name:       string,
    position:   string,
    team:       string,
    age:        number,
    leagueType: 'Redraft' | 'Dynasty',
): PlayerIntel {
    const contractTier   = PLAYER_CONTRACTS[name] ?? null;
    const contractFactor = contractTier
        ? CONTRACT_MULTIPLIERS[contractTier]
        : (age <= 25 ? 1.02 : 0.98); // reasonable default

    const draftCapital   = PLAYER_DRAFT_CAPITAL[name] ?? 50;
    const draftCapFactor = 0.92 + (draftCapital / 100) * 0.16; // 0.92–1.08

    const schemeFit = schemeFitScore(position, team);
    const ageFactor = leagueType === 'Dynasty'
        ? ageCurveDynasty(position, age)
        : 1.0;  // Redraft ignores age for DTV (current season value)

    // ── Build insight badges ─────────────────────────────────────────────
    const insights: string[] = [];

    // Age insights (dynasty-relevant)
    if (leagueType === 'Dynasty') {
        if (position === 'RB') {
            if (age <= 23)       insights.push('Prime RB Age');
            else if (age >= 28)  insights.push('RB Decline Risk');
        } else if (position === 'WR') {
            if (age >= 24 && age <= 27) insights.push('WR Prime');
            else if (age >= 31)         insights.push('Aging WR');
        } else if (position === 'QB') {
            if (age >= 27 && age <= 32) insights.push('QB Prime');
        } else if (position === 'TE') {
            if (age >= 25 && age <= 28) insights.push('TE Prime');
            else if (age >= 31)         insights.push('Aging TE');
        }
    }

    // Contract insights
    if (contractTier === 'rookie')    insights.push('Rookie Deal');
    else if (contractTier === 'rookie5th') insights.push('5th-Year Option');
    else if (contractTier === 'expiring') insights.push('Walk Year');
    else if (contractTier === 'ufa') insights.push('Free Agent');

    // Scheme insights
    const s = TEAM_SCHEMES[team];
    if (s) {
        if (position === 'RB'  && s.rbCarryShare >= 1.20) insights.push('Heavy Workload');
        if (position === 'TE'  && s.teTargetShare >= 0.20) insights.push('TE Target Hog');
        if (position === 'WR'  && s.passRate >= 0.64) insights.push('Pass-Heavy Offense');
        if (position === 'QB'  && s.passRate >= 0.64) insights.push('High-Powered Offense');
        if (position === 'RB'  && s.passRate <= 0.55) insights.push('Run-First Scheme');
    }

    // Draft capital (young players only)
    if (age <= 24 && draftCapital >= 90) insights.push('Top-10 Pedigree');
    else if (age <= 24 && draftCapital >= 75) insights.push('High Draft Capital');
    else if (age <= 26 && draftCapital <= 35) insights.push('UDFA Ascent');

    return {
        contractTier,
        contractFactor,
        schemeFit,
        draftCapFactor,
        ageFactor,
        insights: insights.slice(0, 3),
    };
}
