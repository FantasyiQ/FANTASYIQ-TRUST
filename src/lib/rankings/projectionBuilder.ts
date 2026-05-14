// FantasyIQ Trust — Defensive & Kicker Projection Builder
//
// Converts 2025 season stats + Sleeper 2026 ADP into typed projection objects
// that can be passed directly into buildLeagueDefensiveAndKickerRankings.
//
// Pipeline per player/team:
//   1. Divide season totals by gamesPlayed → per-game rates
//   2. Compute positional averages across all players in the group
//   3. Smooth: 0.7 × individual + 0.3 × positional average
//   4. Apply ADP multiplier (0.8–1.2) based on positional ADP percentile
//   5. Scale back to full-season totals (× 17 games default)
//   6. Derive floor/ceiling from per-game variance (or fallback 0.8/1.2)
//   7. Pad each group to a minimum of 32 entities with replacement-level projections

import type {
    RawIdpStats,
    RawKickerStats,
    RawDefenseStats,
    SleeperAdpEntry,
    IdpProjection,
    KickerProjection,
    DefenseProjection,
} from './defensiveTypes';

// ── Constants ──────────────────────────────────────────────────────────────────

const REGRESSION_WEIGHT  = 0.7;  // individual rate weight
const MEAN_WEIGHT        = 0.3;  // positional mean weight
const ADP_WEIGHT_MIN     = 0.8;
const ADP_WEIGHT_RANGE   = 0.4;  // max − min = 0.4
const PROJ_SEASON_GAMES  = 17;
const MIN_POOL_SIZE      = 32;

const DEFAULT_FLOOR_MULT   = 0.80;
const DEFAULT_CEILING_MULT = 1.20;

// ── Helpers ────────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Given per-game variance for a stat, derive floor and ceiling multipliers.
 * We use coefficient of variation (CV = stdDev / mean):
 *   High CV  → lower floor, higher ceiling
 *   Low CV   → both stay closer to 1.0
 * Floor range:   0.65–0.90
 * Ceiling range: 1.10–1.40
 */
function varianceToMultipliers(
    variance: number | undefined,
    statMean: number,
): { floor: number; ceiling: number } {
    if (variance === undefined || variance === 0 || statMean === 0) {
        return { floor: DEFAULT_FLOOR_MULT, ceiling: DEFAULT_CEILING_MULT };
    }
    const stdDev = Math.sqrt(variance);
    const cv     = stdDev / Math.abs(statMean);
    // Clamp CV to [0, 1] for scaling
    const cvClamped = Math.min(cv, 1);
    const floor   = 0.90 - 0.25 * cvClamped;   // 0.90 → 0.65
    const ceiling = 1.10 + 0.30 * cvClamped;   // 1.10 → 1.40
    return { floor, ceiling };
}

/**
 * Build ADP lookup map for a position group.
 * Returns a Map<id, adpPercentile> where 1.0 = best (lowest ADP number).
 */
function buildAdpPercentiles(
    entries: SleeperAdpEntry[],
    position: string,
): Map<string, number> {
    const group = entries.filter(e => e.position === position);
    if (group.length === 0) return new Map();

    // Sort ascending by adp (lower adp = drafted earlier = better)
    const sorted = [...group].sort((a, b) => a.adp - b.adp);
    const n      = sorted.length;

    const map = new Map<string, number>();
    sorted.forEach((e, i) => {
        // Best player → percentile 1.0; worst → 0.0
        const percentile = n === 1 ? 1 : 1 - i / (n - 1);
        map.set(e.id, percentile);
    });
    return map;
}

function adpWeight(percentile: number | undefined): number {
    const p = percentile ?? 0.5; // unknown → neutral
    return ADP_WEIGHT_MIN + ADP_WEIGHT_RANGE * p;
}

// ── IDP ────────────────────────────────────────────────────────────────────────

const IDP_STAT_KEYS = [
    'soloTackles', 'assists', 'sacks', 'tfl', 'interceptions',
    'forcedFumbles', 'fumbleRecoveries', 'passesDefended', 'defensiveTds',
    'safeties', 'qbHits',
] as const;
type IdpStatKey = (typeof IDP_STAT_KEYS)[number];

function rawIdpToPerGame(r: RawIdpStats): Record<IdpStatKey, number> {
    const g = Math.max(r.gamesPlayed, 1);
    return {
        soloTackles:       r.soloTackles       / g,
        assists:           r.assists           / g,
        sacks:             r.sacks             / g,
        tfl:               r.tfl               / g,
        interceptions:     r.interceptions     / g,
        forcedFumbles:     r.forcedFumbles     / g,
        fumbleRecoveries:  r.fumbleRecoveries  / g,
        passesDefended:    r.passesDefended    / g,
        defensiveTds:      r.defensiveTds      / g,
        safeties:          r.safeties          / g,
        qbHits:            (r.qbHits ?? 0)     / g,
    };
}

function positionalMeanIdp(
    players: RawIdpStats[],
    position: 'DL' | 'LB' | 'DB',
): Record<IdpStatKey, number> {
    const group = players.filter(p => p.position === position);
    if (group.length === 0) {
        return Object.fromEntries(IDP_STAT_KEYS.map(k => [k, 0])) as Record<IdpStatKey, number>;
    }
    const pgAll = group.map(rawIdpToPerGame);
    return Object.fromEntries(
        IDP_STAT_KEYS.map(k => [k, mean(pgAll.map(p => p[k]))])
    ) as Record<IdpStatKey, number>;
}

function makeReplacementIdp(
    position: 'DL' | 'LB' | 'DB',
    posAvg: Record<IdpStatKey, number>,
    index: number,
): IdpProjection {
    const scale = 0.7; // replacement level = 70% of average
    return {
        playerId:         `__replacement_${position}_${index}`,
        position,
        soloTackles:      posAvg.soloTackles      * scale * PROJ_SEASON_GAMES,
        assists:          posAvg.assists           * scale * PROJ_SEASON_GAMES,
        sacks:            posAvg.sacks             * scale * PROJ_SEASON_GAMES,
        tfl:              posAvg.tfl               * scale * PROJ_SEASON_GAMES,
        interceptions:    posAvg.interceptions     * scale * PROJ_SEASON_GAMES,
        forcedFumbles:    posAvg.forcedFumbles     * scale * PROJ_SEASON_GAMES,
        fumbleRecoveries: posAvg.fumbleRecoveries  * scale * PROJ_SEASON_GAMES,
        passesDefended:   posAvg.passesDefended    * scale * PROJ_SEASON_GAMES,
        defensiveTds:     posAvg.defensiveTds      * scale * PROJ_SEASON_GAMES,
        safeties:         posAvg.safeties          * scale * PROJ_SEASON_GAMES,
        qbHits:           posAvg.qbHits            * scale * PROJ_SEASON_GAMES,
        floorMultiplier:  DEFAULT_FLOOR_MULT,
        ceilingMultiplier: DEFAULT_CEILING_MULT,
    };
}

export function buildIdpProjections(
    rawStats: RawIdpStats[],
    adpEntries: SleeperAdpEntry[],
): IdpProjection[] {
    const positions = ['DL', 'LB', 'DB'] as const;
    const projections: IdpProjection[] = [];

    for (const pos of positions) {
        const group      = rawStats.filter(r => r.position === pos);
        const posAvg     = positionalMeanIdp(rawStats, pos);
        const adpMap     = buildAdpPercentiles(adpEntries, pos);

        for (const raw of group) {
            const pg      = rawIdpToPerGame(raw);
            const weight  = adpWeight(adpMap.get(raw.playerId));

            const adjusted: Record<IdpStatKey, number> = Object.fromEntries(
                IDP_STAT_KEYS.map(k => {
                    const smoothed = REGRESSION_WEIGHT * pg[k] + MEAN_WEIGHT * posAvg[k];
                    return [k, smoothed * weight * PROJ_SEASON_GAMES];
                })
            ) as Record<IdpStatKey, number>;

            // Derive floor/ceiling from variance of primary stat for position
            const primaryStat: IdpStatKey =
                pos === 'DL' ? 'sacks' : pos === 'LB' ? 'soloTackles' : 'passesDefended';
            const { floor, ceiling } = varianceToMultipliers(
                raw.statVariance?.[primaryStat],
                pg[primaryStat],
            );

            projections.push({
                playerId:          raw.playerId,
                position:          pos,
                age:               raw.age,
                soloTackles:       adjusted.soloTackles,
                assists:           adjusted.assists,
                sacks:             adjusted.sacks,
                tfl:               adjusted.tfl,
                interceptions:     adjusted.interceptions,
                forcedFumbles:     adjusted.forcedFumbles,
                fumbleRecoveries:  adjusted.fumbleRecoveries,
                passesDefended:    adjusted.passesDefended,
                defensiveTds:      adjusted.defensiveTds,
                safeties:          adjusted.safeties,
                qbHits:            adjusted.qbHits,
                floorMultiplier:   floor,
                ceilingMultiplier: ceiling,
            });
        }

        // Pad to minimum pool size per position
        let padIdx = 0;
        while (projections.filter(p => p.position === pos).length < MIN_POOL_SIZE) {
            projections.push(makeReplacementIdp(pos, posAvg, padIdx++));
        }
    }

    return projections;
}

// ── Kickers ────────────────────────────────────────────────────────────────────

const KICKER_STAT_KEYS = ['fg_0_39', 'fg_40_49', 'fg_50_plus', 'xp', 'missedFg', 'missedXp'] as const;
type KickerStatKey = (typeof KICKER_STAT_KEYS)[number];

function rawKickerToPerGame(r: RawKickerStats): Record<KickerStatKey, number> {
    const g = Math.max(r.gamesPlayed, 1);
    return {
        fg_0_39:    r.fg_0_39    / g,
        fg_40_49:   r.fg_40_49   / g,
        fg_50_plus: r.fg_50_plus / g,
        xp:         r.xp         / g,
        missedFg:   r.missedFg   / g,
        missedXp:   r.missedXp   / g,
    };
}

function positionalMeanKicker(players: RawKickerStats[]): Record<KickerStatKey, number> {
    if (players.length === 0) {
        return Object.fromEntries(KICKER_STAT_KEYS.map(k => [k, 0])) as Record<KickerStatKey, number>;
    }
    const pgAll = players.map(rawKickerToPerGame);
    return Object.fromEntries(
        KICKER_STAT_KEYS.map(k => [k, mean(pgAll.map(p => p[k]))])
    ) as Record<KickerStatKey, number>;
}

function makeReplacementKicker(posAvg: Record<KickerStatKey, number>, index: number): KickerProjection {
    const scale = 0.7;
    return {
        playerId:          `__replacement_K_${index}`,
        fg_0_39:           posAvg.fg_0_39    * scale * PROJ_SEASON_GAMES,
        fg_40_49:          posAvg.fg_40_49   * scale * PROJ_SEASON_GAMES,
        fg_50_plus:        posAvg.fg_50_plus * scale * PROJ_SEASON_GAMES,
        xp:                posAvg.xp         * scale * PROJ_SEASON_GAMES,
        missedFg:          posAvg.missedFg   * scale * PROJ_SEASON_GAMES,
        missedXp:          posAvg.missedXp   * scale * PROJ_SEASON_GAMES,
        floorMultiplier:   DEFAULT_FLOOR_MULT,
        ceilingMultiplier: DEFAULT_CEILING_MULT,
    };
}

export function buildKickerProjections(
    rawStats: RawKickerStats[],
    adpEntries: SleeperAdpEntry[],
): KickerProjection[] {
    const posAvg  = positionalMeanKicker(rawStats);
    const adpMap  = buildAdpPercentiles(adpEntries, 'K');
    const projections: KickerProjection[] = [];

    for (const raw of rawStats) {
        const pg     = rawKickerToPerGame(raw);
        const weight = adpWeight(adpMap.get(raw.playerId));

        const adjusted: Record<KickerStatKey, number> = Object.fromEntries(
            KICKER_STAT_KEYS.map(k => {
                const smoothed = REGRESSION_WEIGHT * pg[k] + MEAN_WEIGHT * posAvg[k];
                return [k, smoothed * weight * PROJ_SEASON_GAMES];
            })
        ) as Record<KickerStatKey, number>;

        const { floor, ceiling } = varianceToMultipliers(
            raw.statVariance?.['fg_0_39'],
            pg.fg_0_39,
        );

        projections.push({
            playerId:          raw.playerId,
            fg_0_39:           adjusted.fg_0_39,
            fg_40_49:          adjusted.fg_40_49,
            fg_50_plus:        adjusted.fg_50_plus,
            xp:                adjusted.xp,
            missedFg:          adjusted.missedFg,
            missedXp:          adjusted.missedXp,
            floorMultiplier:   floor,
            ceilingMultiplier: ceiling,
        });
    }

    let padIdx = 0;
    while (projections.length < MIN_POOL_SIZE) {
        projections.push(makeReplacementKicker(posAvg, padIdx++));
    }

    return projections;
}

// ── DEF/ST ─────────────────────────────────────────────────────────────────────

const DEF_STAT_KEYS = [
    'sacks', 'interceptions', 'fumbleRecoveries', 'defensiveTds', 'safeties', 'returnTds',
] as const;
type DefStatKey = (typeof DEF_STAT_KEYS)[number];

function rawDefToPerGame(r: RawDefenseStats): Record<DefStatKey, number> {
    const g = Math.max(r.gamesPlayed, 1);
    return {
        sacks:            r.sacks            / g,
        interceptions:    r.interceptions    / g,
        fumbleRecoveries: r.fumbleRecoveries / g,
        defensiveTds:     r.defensiveTds     / g,
        safeties:         r.safeties         / g,
        returnTds:        r.returnTds        / g,
    };
}

function positionalMeanDef(teams: RawDefenseStats[]): Record<DefStatKey, number> {
    if (teams.length === 0) {
        return Object.fromEntries(DEF_STAT_KEYS.map(k => [k, 0])) as Record<DefStatKey, number>;
    }
    const pgAll = teams.map(rawDefToPerGame);
    return Object.fromEntries(
        DEF_STAT_KEYS.map(k => [k, mean(pgAll.map(p => p[k]))])
    ) as Record<DefStatKey, number>;
}

/**
 * Builds a discrete probability distribution over scoring buckets
 * from game-level points-allowed data.
 *
 * Bucket boundaries used: 0, 6, 13, 17, 21, 27, 34, 45, Infinity
 * These match common fantasy scoring tiers.
 */
const BUCKET_BOUNDARIES = [0, 6, 13, 17, 21, 27, 34, 45, Infinity];

function buildPointsAllowedDistribution(
    pointsPerGame: number[],
    adpMultiplier = 1.0,
): { maxPoints: number; probability: number }[] {
    if (pointsPerGame.length === 0) {
        // Default: league-average distribution (roughly bell-curved around 21–27)
        return [
            { maxPoints: 0,        probability: 0.03 },
            { maxPoints: 6,        probability: 0.06 },
            { maxPoints: 13,       probability: 0.12 },
            { maxPoints: 17,       probability: 0.15 },
            { maxPoints: 21,       probability: 0.20 },
            { maxPoints: 27,       probability: 0.22 },
            { maxPoints: 34,       probability: 0.14 },
            { maxPoints: 45,       probability: 0.06 },
            { maxPoints: Infinity, probability: 0.02 },
        ];
    }

    // Apply ADP multiplier: better defenses (higher ADP percentile) allow fewer points.
    // Shift the mean downward by up to 10% for the top-ranked defenses.
    const shiftFactor = 1 / adpMultiplier; // adpMultiplier 1.2 → shift 0.833
    const adjusted    = pointsPerGame.map(p => p * shiftFactor);

    const counts = new Array(BUCKET_BOUNDARIES.length).fill(0);
    for (const pts of adjusted) {
        for (let i = 0; i < BUCKET_BOUNDARIES.length; i++) {
            if (pts <= BUCKET_BOUNDARIES[i]) {
                counts[i]++;
                break;
            }
        }
    }
    const total = adjusted.length;
    return BUCKET_BOUNDARIES.map((maxPts, i) => ({
        maxPoints:   maxPts,
        probability: counts[i] / total,
    }));
}

function makeReplacementDefense(
    posAvg: Record<DefStatKey, number>,
    index: number,
): DefenseProjection {
    const scale = 0.7;
    return {
        teamId:            `__replacement_DEF_${index}`,
        sacks:             posAvg.sacks            * scale * PROJ_SEASON_GAMES,
        interceptions:     posAvg.interceptions    * scale * PROJ_SEASON_GAMES,
        fumbleRecoveries:  posAvg.fumbleRecoveries * scale * PROJ_SEASON_GAMES,
        defensiveTds:      posAvg.defensiveTds     * scale * PROJ_SEASON_GAMES,
        safeties:          posAvg.safeties         * scale * PROJ_SEASON_GAMES,
        returnTds:         posAvg.returnTds        * scale * PROJ_SEASON_GAMES,
        pointsAllowedDistribution: buildPointsAllowedDistribution([]),
        floorMultiplier:   DEFAULT_FLOOR_MULT,
        ceilingMultiplier: DEFAULT_CEILING_MULT,
    };
}

export function buildDefenseProjections(
    rawStats: RawDefenseStats[],
    adpEntries: SleeperAdpEntry[],
): DefenseProjection[] {
    const posAvg  = positionalMeanDef(rawStats);
    const adpMap  = buildAdpPercentiles(adpEntries, 'DEF');
    const projections: DefenseProjection[] = [];

    for (const raw of rawStats) {
        const pg          = rawDefToPerGame(raw);
        const percentile  = adpMap.get(raw.teamId) ?? 0.5;
        const weight      = adpWeight(percentile);

        const adjusted: Record<DefStatKey, number> = Object.fromEntries(
            DEF_STAT_KEYS.map(k => {
                const smoothed = REGRESSION_WEIGHT * pg[k] + MEAN_WEIGHT * posAvg[k];
                return [k, smoothed * weight * PROJ_SEASON_GAMES];
            })
        ) as Record<DefStatKey, number>;

        const distribution = buildPointsAllowedDistribution(
            raw.pointsAllowedPerGame,
            weight,
        );

        const { floor, ceiling } = varianceToMultipliers(
            raw.statVariance?.['sacks'],
            pg.sacks,
        );

        projections.push({
            teamId:            raw.teamId,
            sacks:             adjusted.sacks,
            interceptions:     adjusted.interceptions,
            fumbleRecoveries:  adjusted.fumbleRecoveries,
            defensiveTds:      adjusted.defensiveTds,
            safeties:          adjusted.safeties,
            returnTds:         adjusted.returnTds,
            pointsAllowedDistribution: distribution,
            floorMultiplier:   floor,
            ceilingMultiplier: ceiling,
        });
    }

    let padIdx = 0;
    while (projections.length < MIN_POOL_SIZE) {
        projections.push(makeReplacementDefense(posAvg, padIdx++));
    }

    return projections;
}
