// FantasyIQ Trust — Defensive & Kicker Ranking Engine
//
// Pure computation engine. Takes already-built projections (from projectionBuilder)
// and produces normalized 0–100 value scores with positional rankings.
//
// Pipeline:
//   1. Activation — skip disabled groups entirely
//   2. Fantasy-point projection (league scoring applied)
//   3. Positional scarcity adjustment
//   4. Floor / ceiling / volatility / raw value
//   5. Z-score normalization → 0–100 value score
//   6. Rank assignment + optional IDP overall rank

import type {
    LeagueScoring,
    LeagueLineup,
    IdpProjection,
    KickerProjection,
    DefenseProjection,
    RankedEntity,
    RankingResult,
} from './defensiveTypes';

// ── Dynasty IDP age curve ──────────────────────────────────────────────────────

function dynastyAgeMultiplier(age: number, position: 'DL' | 'LB' | 'DB'): number {
    if (position === 'DL') {
        if (age <= 24) return 1.08;
        if (age <= 27) return 1.12;
        if (age <= 29) return 1.10;
        if (age <= 31) return 1.00;
        if (age <= 33) return 0.92;
        return 0.85;
    }
    if (position === 'LB') {
        if (age <= 23) return 1.10;
        if (age <= 26) return 1.12;
        if (age <= 28) return 1.05;
        if (age <= 30) return 0.95;
        if (age <= 32) return 0.88;
        return 0.80;
    }
    // DB (CB/S)
    if (age <= 22) return 1.12;
    if (age <= 25) return 1.10;
    if (age <= 27) return 1.00;
    if (age <= 29) return 0.90;
    if (age <= 31) return 0.82;
    return 0.75;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MIN_POOL_SIZE      = 32;
const SCARCITY_MIN       = 0.5;
const SCARCITY_MAX       = 2.0;

// ── Math helpers ───────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// ── Step 1: Fantasy point projection ──────────────────────────────────────────

function projectIdpPoints(p: IdpProjection, scoring: LeagueScoring['idp']): number {
    return (
        p.soloTackles      * scoring.soloTackle   +
        p.assists          * scoring.assist        +
        p.sacks            * scoring.sack          +
        p.tfl              * scoring.tfl           +
        p.interceptions    * scoring.interception  +
        p.forcedFumbles    * scoring.forcedFumble  +
        p.fumbleRecoveries * scoring.fumbleRecovery +
        p.passesDefended   * scoring.passDefended  +
        p.defensiveTds     * scoring.defensiveTd   +
        p.safeties         * scoring.safety        +
        (p.qbHits ?? 0)    * (scoring.qbHit ?? 0)
    );
}

function projectKickerPoints(p: KickerProjection, scoring: LeagueScoring['kicker']): number {
    return (
        p.fg_0_39    * scoring.fg_0_39    +
        p.fg_40_49   * scoring.fg_40_49   +
        p.fg_50_plus * scoring.fg_50_plus +
        p.xp         * scoring.xp         +
        p.missedFg   * scoring.missedFg   +
        p.missedXp   * scoring.missedXp
    );
}

function projectDefensePoints(p: DefenseProjection, scoring: LeagueScoring['defense']): number {
    // Points-allowed expected value using the probability distribution
    const pointsAllowedEV = p.pointsAllowedDistribution.reduce((sum, bucket) => {
        const matchedBucket = scoring.pointsAllowedBuckets.find(
            b => b.maxPoints >= bucket.maxPoints
        ) ?? scoring.pointsAllowedBuckets[scoring.pointsAllowedBuckets.length - 1];
        return sum + bucket.probability * (matchedBucket?.points ?? 0);
    }, 0);

    return (
        p.sacks            * scoring.sack            +
        p.interceptions    * scoring.interception    +
        p.fumbleRecoveries * scoring.fumbleRecovery  +
        p.defensiveTds     * scoring.defensiveTd     +
        p.safeties         * scoring.safety          +
        p.returnTds        * scoring.returnTd        +
        pointsAllowedEV
    );
}

// ── Step 2: Scarcity ───────────────────────────────────────────────────────────

function scarcityFactor(
    startersPerTeam: number,
    teams: number,
    actualCount: number,
): number {
    const demand = startersPerTeam * teams;
    const supply = Math.max(actualCount, MIN_POOL_SIZE);
    return clamp(demand / supply, SCARCITY_MIN, SCARCITY_MAX);
}

// ── Steps 3–5: Floor/ceiling/volatility/rawValue → valueScore ─────────────────

interface Intermediate {
    projectedPoints: number;
    scarcity:        number;
    floor:           number;
    ceiling:         number;
    volatility:      number;
    rawValue:        number;
}

function buildIntermediate(
    projectedPoints: number,
    scarcity:        number,
    floorMult:       number,
    ceilingMult:     number,
): Intermediate {
    const adjusted  = projectedPoints * scarcity;
    const floor     = adjusted * floorMult;
    const ceiling   = adjusted * ceilingMult;
    const volatility = ceiling - floor;
    const rawValue  =
        0.2 * floor +
        0.6 * adjusted +
        0.3 * ceiling -
        0.1 * volatility;
    return { projectedPoints, scarcity, floor, ceiling, volatility, rawValue };
}

function normalizeToValueScore(rawValues: number[]): number[] {
    if (rawValues.length <= 1) return rawValues.map(() => 50);
    const n = rawValues.length;
    // Percentile-rank normalization: immune to skewed distributions.
    // Best player → 100, worst → 0, everyone else proportional by rank.
    // Ties share the best rank in their group (same projected points = same value).
    const sorted = [...rawValues].sort((a, b) => b - a); // descending: index 0 = best
    const rankMap = new Map<number, number>();
    sorted.forEach((v, i) => { if (!rankMap.has(v)) rankMap.set(v, i); });
    return rawValues.map(rv => {
        const rank = rankMap.get(rv) ?? n - 1;
        return clamp(Math.round(((n - 1 - rank) / (n - 1)) * 100 * 10) / 10, 0, 100);
    });
}

// ── IDP position value caps ────────────────────────────────────────────────────
// Derives per-position max scores from actual top-5 projected fantasy point
// averages, relative to the QB baseline. Formula:
//   posMax = clamp( (idpTop5Avg / qbTop5Avg) × 95, 15, 80 )
// Falls back to calibrated constants when offensive averages are unavailable.
const IDP_POS_MAX_FALLBACK: Record<string, number> = { DL: 70, LB: 65, DB: 60 };

function computeIdpCaps(
    entitiesByPosition: Record<string, { inter: Intermediate }[]>,
    offensiveTop5Avg:   Record<string, number>,
): Record<string, number> {
    const qbAvg = offensiveTop5Avg['QB'] ?? 0;
    if (qbAvg === 0) return IDP_POS_MAX_FALLBACK;

    const caps: Record<string, number> = {};
    for (const pos of ['DL', 'LB', 'DB'] as const) {
        const top5 = (entitiesByPosition[pos] ?? [])
            .map(e => e.inter.projectedPoints)
            .sort((a, b) => b - a)
            .slice(0, 5);
        const idpAvg = top5.length > 0 ? top5.reduce((s, v) => s + v, 0) / top5.length : 0;
        caps[pos] = Math.round(clamp((idpAvg / qbAvg) * 95, 15, 80));
    }
    return caps;
}

// ── IDP group builder ──────────────────────────────────────────────────────────

function buildIdpEntities(
    projections:      IdpProjection[],
    scoring:          LeagueScoring['idp'],
    lineup:           LeagueLineup,
    leagueType:       'Dynasty' | 'Redraft' = 'Redraft',
    offensiveTop5Avg: Record<string, number> = {},
): RankedEntity[] {
    const positions = ['DL', 'LB', 'DB'] as const;

    // Compute demand per position (dedicated starters + share of flex IDP)
    // We split IDP flex evenly across the three groups for scarcity calculation.
    const idpFlexShare = Math.ceil(lineup.starters.IDP / 3);

    const entitiesByPosition: Record<string, { proj: IdpProjection; inter: Intermediate }[]> = {};

    for (const pos of positions) {
        const group = projections.filter(p => p.position === pos);
        const posStarters =
            (pos === 'DL' ? lineup.starters.DL : 0) +
            (pos === 'LB' ? lineup.starters.LB : 0) +
            (pos === 'DB' ? lineup.starters.DB : 0) +
            idpFlexShare;

        const sf = scarcityFactor(posStarters, lineup.teams, group.length);

        entitiesByPosition[pos] = group.map(p => {
            let projectedPoints = projectIdpPoints(p, scoring);
            if (leagueType === 'Dynasty' && p.age) {
                projectedPoints *= dynastyAgeMultiplier(p.age, pos);
            }
            return {
                proj:  p,
                inter: buildIntermediate(
                    projectedPoints,
                    sf,
                    p.floorMultiplier   ?? 0.8,
                    p.ceilingMultiplier ?? 1.2,
                ),
            };
        });
    }

    const posCaps = computeIdpCaps(entitiesByPosition, offensiveTop5Avg);
    const allEntities: RankedEntity[] = [];

    for (const pos of positions) {
        const group = entitiesByPosition[pos] ?? [];
        const posMax = posCaps[pos] ?? IDP_POS_MAX_FALLBACK[pos] ?? 65;
        const valueScores = normalizeToValueScore(group.map(e => e.inter.rawValue));

        // Sort by valueScore desc, assign positional rank
        const sorted = group
            .map((e, i) => ({ ...e, valueScore: valueScores[i] }))
            .sort((a, b) => b.valueScore - a.valueScore);

        sorted.forEach((e, rank) => {
            allEntities.push({
                id:              e.proj.playerId,
                position:        e.proj.position,
                projectedPoints: e.inter.projectedPoints,
                floor:           e.inter.floor,
                ceiling:         e.inter.ceiling,
                volatility:      e.inter.volatility,
                scarcityFactor:  e.inter.scarcity,
                // Scale 0–100 percentile into position-appropriate range
                valueScore:      Math.round((e.valueScore / 100) * posMax * 10) / 10,
                rank:            rank + 1,
            });
        });
    }

    // Overall rank across all IDP positions (for flex considerations)
    const sortedOverall = [...allEntities].sort((a, b) => b.valueScore - a.valueScore);
    sortedOverall.forEach((e, i) => { e.overallRank = i + 1; });

    return allEntities;
}

// ── Kicker group builder ───────────────────────────────────────────────────────

function buildKickerEntities(
    projections: KickerProjection[],
    scoring:     LeagueScoring['kicker'],
    lineup:      LeagueLineup,
): RankedEntity[] {
    const sf = scarcityFactor(lineup.starters.K, lineup.teams, projections.length);

    const intermediates = projections.map(p =>
        buildIntermediate(
            projectKickerPoints(p, scoring),
            sf,
            p.floorMultiplier   ?? 0.8,
            p.ceilingMultiplier ?? 1.2,
        )
    );
    const valueScores = normalizeToValueScore(intermediates.map(i => i.rawValue));

    const combined = projections
        .map((p, idx) => ({ p, inter: intermediates[idx], vs: valueScores[idx] }))
        .sort((a, b) => b.vs - a.vs);

    return combined.map(({ p, inter, vs }, rank) => ({
        id:              p.playerId,
        position:        'K' as const,
        projectedPoints: inter.projectedPoints,
        floor:           inter.floor,
        ceiling:         inter.ceiling,
        volatility:      inter.volatility,
        scarcityFactor:  inter.scarcity,
        valueScore:      Math.round((vs / 100) * 45 * 10) / 10,  // K max 45
        rank:            rank + 1,
    }));
}

// ── Defense group builder ──────────────────────────────────────────────────────

function buildDefenseEntities(
    projections: DefenseProjection[],
    scoring:     LeagueScoring['defense'],
    lineup:      LeagueLineup,
): RankedEntity[] {
    const sf = scarcityFactor(lineup.starters.DEF, lineup.teams, projections.length);

    const intermediates = projections.map(p =>
        buildIntermediate(
            projectDefensePoints(p, scoring),
            sf,
            p.floorMultiplier   ?? 0.8,
            p.ceilingMultiplier ?? 1.2,
        )
    );
    const valueScores = normalizeToValueScore(intermediates.map(i => i.rawValue));

    const combined = projections
        .map((p, idx) => ({ p, inter: intermediates[idx], vs: valueScores[idx] }))
        .sort((a, b) => b.vs - a.vs);

    return combined.map(({ p, inter, vs }, rank) => ({
        id:              p.teamId,
        position:        'DEF' as const,
        projectedPoints: inter.projectedPoints,
        floor:           inter.floor,
        ceiling:         inter.ceiling,
        volatility:      inter.volatility,
        scarcityFactor:  inter.scarcity,
        valueScore:      Math.round((vs / 100) * 55 * 10) / 10,  // DEF max 55
        rank:            rank + 1,
    }));
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function buildLeagueDefensiveAndKickerRankings(
    scoring:             LeagueScoring,
    lineup:              LeagueLineup,
    idpProjections:      IdpProjection[],
    kickerProjections:   KickerProjection[],
    defenseProjections:  DefenseProjection[],
    leagueType:          'Dynasty' | 'Redraft' = 'Redraft',
    offensiveTop5Avg:    Record<string, number> = {},
): RankingResult {
    const idpEnabled =
        lineup.starters.DL  > 0 ||
        lineup.starters.LB  > 0 ||
        lineup.starters.DB  > 0 ||
        lineup.starters.IDP > 0;

    const kickerEnabled  = lineup.starters.K   > 0;
    const defenseEnabled = lineup.starters.DEF > 0;

    return {
        idpEnabled,
        kickerEnabled,
        defenseEnabled,
        idp:      idpEnabled      ? buildIdpEntities(idpProjections, scoring.idp, lineup, leagueType, offensiveTop5Avg) : [],
        kickers:  kickerEnabled   ? buildKickerEntities(kickerProjections, scoring.kicker, lineup)   : [],
        defenses: defenseEnabled  ? buildDefenseEntities(defenseProjections, scoring.defense, lineup) : [],
    };
}
