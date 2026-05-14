// FantasyIQ Trust — Seed Projections
//
// Builds baseline projections when 2025 per-player stats are not yet available.
// Uses NFL population averages scaled to a full 17-game season.
//
// All players at the same position receive identical projections.
// The defensive ranking engine will still produce meaningful relative rankings
// because it applies positional scarcity (demand / supply).
//
// Once actual 2025 stats and Sleeper 2026 ADP are available, replace this with
// buildIdpProjections / buildKickerProjections / buildDefenseProjections from
// projectionBuilder.ts which apply per-player regression and ADP adjustments.

import type { IdpProjection, KickerProjection, DefenseProjection } from './defensiveTypes';

const MIN_POOL = 32;

// ── NFL population averages (17-game full season) ─────────────────────────────

// DL (defensive linemen): high sacks, moderate tackles
const DL_AVG: Omit<IdpProjection, 'playerId' | 'position' | 'floorMultiplier' | 'ceilingMultiplier'> = {
    soloTackles:      30,
    assists:           8,
    sacks:             4,
    tfl:               4,
    interceptions:     0.2,
    forcedFumbles:     1,
    fumbleRecoveries:  0.8,
    passesDefended:    1,
    defensiveTds:      0.2,
    safeties:          0.05,
    qbHits:            8,
};

// LB (linebackers): tackle leaders
const LB_AVG: Omit<IdpProjection, 'playerId' | 'position' | 'floorMultiplier' | 'ceilingMultiplier'> = {
    soloTackles:      65,
    assists:          25,
    sacks:             2,
    tfl:               5,
    interceptions:     1.2,
    forcedFumbles:     1.2,
    fumbleRecoveries:  0.7,
    passesDefended:    3,
    defensiveTds:      0.4,
    safeties:          0.05,
    qbHits:            2,
};

// DB (defensive backs): interception/PD leaders
const DB_AVG: Omit<IdpProjection, 'playerId' | 'position' | 'floorMultiplier' | 'ceilingMultiplier'> = {
    soloTackles:      50,
    assists:          10,
    sacks:             0.5,
    tfl:               1,
    interceptions:     2.5,
    forcedFumbles:     0.5,
    fumbleRecoveries:  0.4,
    passesDefended:    9,
    defensiveTds:      0.5,
    safeties:          0.02,
    qbHits:            0.3,
};

// K (kickers): starting NFL kicker, 17 games
const K_AVG: Omit<KickerProjection, 'playerId' | 'floorMultiplier' | 'ceilingMultiplier'> = {
    fg_0_39:    13,
    fg_40_49:    9,
    fg_50_plus:  4,
    xp:         32,
    missedFg:    3,
    missedXp:    1,
};

// DEF/ST: typical NFL team season
const DEF_POINTS_DISTRIBUTION: { maxPoints: number; probability: number }[] = [
    { maxPoints: 0,        probability: 0.03 },
    { maxPoints: 6,        probability: 0.07 },
    { maxPoints: 13,       probability: 0.13 },
    { maxPoints: 20,       probability: 0.20 },
    { maxPoints: 27,       probability: 0.24 },
    { maxPoints: 34,       probability: 0.18 },
    { maxPoints: 45,       probability: 0.11 },
    { maxPoints: Infinity, probability: 0.04 },
];

const DEF_AVG: Omit<DefenseProjection, 'teamId' | 'pointsAllowedDistribution' | 'floorMultiplier' | 'ceilingMultiplier'> = {
    sacks:             38,
    interceptions:     14,
    fumbleRecoveries:   8,
    defensiveTds:       3,
    safeties:           1,
    returnTds:          1,
};

// ── NFL team IDs (32 teams) ────────────────────────────────────────────────────

const NFL_TEAMS = [
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE',
    'DAL','DEN','DET','GB', 'HOU','IND','JAX','KC',
    'LAC','LAR','LV', 'MIA','MIN','NE', 'NO', 'NYG',
    'NYJ','PHI','PIT','SEA','SF', 'TB', 'TEN','WAS',
];

// ── Builder functions ──────────────────────────────────────────────────────────

/**
 * Builds seed IDP projections for a list of Sleeper player IDs.
 * All players in the same position group receive the population average.
 * Pads to MIN_POOL per position with synthetic entries.
 */
export function buildIdpSeedProjections(
    players: { playerId: string; position: 'DL' | 'LB' | 'DB' }[],
): IdpProjection[] {
    const projections: IdpProjection[] = players.map(p => ({
        playerId:          p.playerId,
        position:          p.position,
        floorMultiplier:   0.8,
        ceilingMultiplier: 1.2,
        ...(p.position === 'DL' ? DL_AVG : p.position === 'LB' ? LB_AVG : DB_AVG),
    }));

    // Pad to minimum pool per position
    for (const pos of ['DL', 'LB', 'DB'] as const) {
        const avg = pos === 'DL' ? DL_AVG : pos === 'LB' ? LB_AVG : DB_AVG;
        let padIdx = 0;
        while (projections.filter(p => p.position === pos).length < MIN_POOL) {
            projections.push({
                playerId: `__seed_${pos}_${padIdx++}`,
                position: pos,
                floorMultiplier:   0.8,
                ceilingMultiplier: 1.2,
                ...avg,
            });
        }
    }

    return projections;
}

/**
 * Builds seed kicker projections for a list of Sleeper player IDs.
 * All kickers receive the same population-average projection.
 */
export function buildKickerSeedProjections(playerIds: string[]): KickerProjection[] {
    const projections: KickerProjection[] = playerIds.map(id => ({
        playerId:          id,
        floorMultiplier:   0.8,
        ceilingMultiplier: 1.2,
        ...K_AVG,
    }));

    let padIdx = 0;
    while (projections.length < MIN_POOL) {
        projections.push({
            playerId: `__seed_K_${padIdx++}`,
            floorMultiplier:   0.8,
            ceilingMultiplier: 1.2,
            ...K_AVG,
        });
    }

    return projections;
}

/**
 * Builds seed DEF/ST projections.
 * Uses all 32 NFL team abbreviations as team IDs when no specific list is given.
 */
export function buildDefenseSeedProjections(teamIds?: string[]): DefenseProjection[] {
    const ids = teamIds && teamIds.length > 0 ? teamIds : NFL_TEAMS;
    const projections: DefenseProjection[] = ids.map(teamId => ({
        teamId,
        floorMultiplier:   0.8,
        ceilingMultiplier: 1.2,
        pointsAllowedDistribution: DEF_POINTS_DISTRIBUTION,
        ...DEF_AVG,
    }));

    let padIdx = 0;
    while (projections.length < MIN_POOL) {
        projections.push({
            teamId: `__seed_DEF_${padIdx++}`,
            floorMultiplier:   0.8,
            ceilingMultiplier: 1.2,
            pointsAllowedDistribution: DEF_POINTS_DISTRIBUTION,
            ...DEF_AVG,
        });
    }

    return projections;
}

// ── Position normaliser ────────────────────────────────────────────────────────

/**
 * Maps raw Sleeper position strings to canonical IDP positions.
 * Returns null for non-IDP positions.
 */
export function toIdpPosition(sleeperPos: string): 'DL' | 'LB' | 'DB' | null {
    const p = sleeperPos.toUpperCase();
    if (['DL', 'DE', 'DT', 'NT'].includes(p))                return 'DL';
    if (['LB', 'OLB', 'ILB', 'MLB', 'EDGE'].includes(p))     return 'LB';
    if (['DB', 'CB', 'S', 'SS', 'FS', 'SAF'].includes(p))    return 'DB';
    return null;
}
