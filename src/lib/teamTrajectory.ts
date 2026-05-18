// FantasyiQ Trust — Team Trajectory Engine
// Computes a team's dynasty trajectory from roster age, starter quality,
// pick leverage, and production/future ratio. All inputs are pure data — no
// API calls here.

import type { LeaguePhaseResult } from '@/lib/leaguePhase';

// ── Input / output types ──────────────────────────────────────────────────────

export interface RosterPlayer {
    id:        string;
    name:      string;
    position:  string;
    age:       number | null;
    ktcValue:  number;   // 0–9999 (KeepTradeCut dynasty value)
}

export interface OwnedPick {
    season: string;
    round:  number;
    tier?:  'Early' | 'Mid' | 'Late';  // when slot is unknown
}

export interface TeamTrajectoryInput {
    players:     RosterPlayer[];
    ownedPicks:  OwnedPick[];
    leagueSize:  number;
    leagueType:  'Dynasty' | 'Redraft';
    superflex:   boolean;
    phaseResult: LeaguePhaseResult;
}

export interface TeamTrajectory {
    mode:                   'CONTENDER' | 'REBUILDER' | 'STUCK' | 'ASCENDING' | 'DECLINING';
    winCurve:               'EARLY_PEAK' | 'LATE_PEAK' | 'FLAT' | 'FALLING';
    pickLeverage:           number;  // 0–100
    rosterAgeCurve:         number;  // 0–100 (0 = very young, 100 = very old)
    starterQuality:         number;  // 0–100
    productionFutureRatio:  number;  // 0–100 (0 = all future, 100 = all production)
    depthStability:         number;  // 0–100
    composite:              number;  // 0–100 weighted composite
    recommendedDirection:   'BUY_PRODUCTION' | 'BUY_PICKS' | 'HOLD' | 'SELL_PRODUCTION';
}

// ── Position configuration ────────────────────────────────────────────────────

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

// Age at which a position player's value starts declining meaningfully.
// youngAge = bottom of the "neutral" band (below = pure upside)
// cliffAge = age where value approaches zero
const AGE_CURVES: Record<string, { youngAge: number; cliffAge: number }> = {
    QB: { youngAge: 24, cliffAge: 38 },
    RB: { youngAge: 22, cliffAge: 30 },
    WR: { youngAge: 23, cliffAge: 33 },
    TE: { youngAge: 23, cliffAge: 33 },
};

// ── Sub-calculators ───────────────────────────────────────────────────────────

/**
 * rosterAgeCurve: 0 = very young roster, 100 = very old roster.
 * Weighted by KTC value so star players dominate the signal.
 */
function calculateRosterAgeCurve(players: RosterPlayer[]): number {
    const skillPlayers = players.filter(p => SKILL_POSITIONS.has(p.position) && p.ktcValue > 0);
    if (skillPlayers.length === 0) return 50;

    let weightedBurden = 0;
    let totalWeight    = 0;

    for (const player of skillPlayers) {
        const age = player.age ?? 26;  // assume average prime if unknown
        const cfg = AGE_CURVES[player.position] ?? { youngAge: 24, cliffAge: 34 };
        // age burden: 0 at youngAge, 100 at cliffAge
        const burden = Math.max(0, Math.min(100,
            (age - cfg.youngAge) / (cfg.cliffAge - cfg.youngAge) * 100
        ));
        weightedBurden += burden * player.ktcValue;
        totalWeight    += player.ktcValue;
    }

    return totalWeight > 0 ? Math.round(weightedBurden / totalWeight) : 50;
}

/**
 * starterQuality: average value of the top-8 players, normalized to 0–100.
 * Meaningful KTC range: ~500 (fringe starter) to ~9500 (elite)
 */
function calculateStarterQuality(players: RosterPlayer[]): number {
    const sorted  = [...players].sort((a, b) => b.ktcValue - a.ktcValue);
    const starters = sorted.slice(0, 8);
    if (starters.length === 0) return 0;

    const avg = starters.reduce((s, p) => s + p.ktcValue, 0) / starters.length;
    // Normalize: 500 = 0, 8000 = 100
    return Math.max(0, Math.min(100, Math.round((avg - 500) / 75)));
}

/**
 * depthStability: how well-stocked each position is relative to ideal dynasty depth.
 */
function calculateDepthStability(players: RosterPlayer[]): number {
    const idealDepth: Record<string, number> = { QB: 2, RB: 5, WR: 6, TE: 2 };
    let score = 0;
    let total = 0;

    for (const [pos, ideal] of Object.entries(idealDepth)) {
        const count = players.filter(p => p.position === pos).length;
        score += Math.min(1, count / ideal) * 100;
        total++;
    }

    return total > 0 ? Math.round(score / total) : 50;
}

/**
 * pickLeverage: quality-weighted score of owned future picks.
 * 2 quality 1st-round picks = score of 100.
 */
function calculatePickLeverage(ownedPicks: OwnedPick[]): number {
    let units = 0;

    for (const pick of ownedPicks) {
        if (pick.round === 1) {
            if (pick.tier === 'Early')     units += 1.2;
            else if (pick.tier === 'Late') units += 0.7;
            else                           units += 1.0;  // Mid or unknown 1st
        } else if (pick.round === 2) {
            units += 0.5;
        } else if (pick.round === 3) {
            units += 0.25;
        } else {
            units += 0.1;
        }
    }

    // Normalize: 2.0 quality units = 100
    return Math.max(0, Math.min(100, Math.round(units / 2.0 * 100)));
}

/**
 * productionFutureRatio: 0 = entirely future-value roster, 100 = entirely production-value roster.
 * Derived from age-based future weight per player, weighted by KTC value.
 */
function calculateProductionFutureRatio(players: RosterPlayer[]): number {
    const skillPlayers = players.filter(p => SKILL_POSITIONS.has(p.position) && p.ktcValue > 0);
    if (skillPlayers.length === 0) return 50;

    let productionWeight = 0;
    let totalValue       = 0;

    for (const player of skillPlayers) {
        const age = player.age ?? 26;
        // Production weight: how much of this player's value is "current production"
        // 22 → 0.0 (pure future), 30 → 1.0 (pure production), linear between
        const prodWeight = Math.max(0, Math.min(1, (age - 22) / 8));
        productionWeight += player.ktcValue * prodWeight;
        totalValue       += player.ktcValue;
    }

    return totalValue > 0 ? Math.round(productionWeight / totalValue * 100) : 50;
}

function deriveWinCurve(ageCurve: number): TeamTrajectory['winCurve'] {
    if (ageCurve > 70) return 'FALLING';
    if (ageCurve > 50) return 'FLAT';
    if (ageCurve > 30) return 'EARLY_PEAK';
    return 'LATE_PEAK';
}

// ── Main export ───────────────────────────────────────────────────────────────

export function getTeamTrajectory(
    input: TeamTrajectoryInput,
): TeamTrajectory {
    const { players, ownedPicks, phaseResult } = input;

    const ageCurve            = calculateRosterAgeCurve(players);
    const starterQuality      = calculateStarterQuality(players);
    const depthStability      = calculateDepthStability(players);
    const pickLeverage        = calculatePickLeverage(ownedPicks);
    const productionFutureRatio = calculateProductionFutureRatio(players);

    // Composite: higher = more ready to compete
    // (100 - ageCurve) rewards younger teams
    const composite = Math.round(
        starterQuality       * 0.35 +
        depthStability       * 0.15 +
        (100 - ageCurve)     * 0.20 +
        productionFutureRatio * 0.15 +
        pickLeverage         * 0.15
    );

    let mode: TeamTrajectory['mode'];
    if      (composite >= 70)                              mode = 'CONTENDER';
    else if (composite <= 35)                              mode = 'REBUILDER';
    else if (ageCurve < 40 && pickLeverage > 60)           mode = 'ASCENDING';
    else if (ageCurve > 70 && pickLeverage < 30)           mode = 'DECLINING';
    else                                                    mode = 'STUCK';

    let recommendedDirection: TeamTrajectory['recommendedDirection'];
    if      (mode === 'CONTENDER' && phaseResult.isWinNowWindow) recommendedDirection = 'BUY_PRODUCTION';
    else if (mode === 'REBUILDER')                               recommendedDirection = 'BUY_PICKS';
    else if (mode === 'DECLINING')                               recommendedDirection = 'SELL_PRODUCTION';
    else                                                          recommendedDirection = 'HOLD';

    return {
        mode,
        winCurve:            deriveWinCurve(ageCurve),
        pickLeverage,
        rosterAgeCurve:      ageCurve,
        starterQuality,
        productionFutureRatio,
        depthStability,
        composite,
        recommendedDirection,
    };
}
