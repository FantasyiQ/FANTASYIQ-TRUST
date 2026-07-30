// FantasyIQ Trust — League Scoring Points Engine
//
// Computes a player's real fantasy points under ANY league's exact
// scoring_settings, from real per-game stat rates. This is what makes the
// value engine react to a league's *specific* scoring rules (rush-attempt
// bonuses, first-down bonuses, TD-distance bonuses, 200-yard game bonuses,
// etc.) generically — no hand-coded per-rule adjustment is required, since
// the dot-product below sums over whatever keys exist in both the player's
// real stats and the league's real settings.

// Individual-vs-positional-mean regression blend — same 0.7/0.3 split
// already proven in projectionBuilder.ts, so a single unusual game (or a
// rookie's small sample) doesn't swing perfFactor wildly.
const REGRESSION_WEIGHT = 0.7;
const MEAN_WEIGHT       = 0.3;

// Keeps perfFactor as a nudge, not a dominant signal — same magnitude
// ceiling as the existing schemeFitScore() multiplier in player-intelligence.ts,
// so FantasyCalc's market-consensus value stays the anchor.
const PERF_FACTOR_MIN = 0.85;
const PERF_FACTOR_MAX = 1.15;

// A player needs at least this many games before their individual rate gets
// full weight; below it, they regress harder toward the positional mean.
const FULL_SAMPLE_GAMES = 8;

// A generic, vanilla-PPR scoring format — representative of the assumptions
// baked into FantasyCalc's generic market-consensus values (no rush-attempt
// bonus, no first-down bonus, no threshold bonuses). This is the reference
// point for measuring whether a specific league's real scoring structurally
// favors one position over another (e.g. Halo's 0.5-pt rush-attempt bonus
// shifting real production toward RB) — a cross-positional signal that a
// per-player factor alone can't capture, since elite players at any position
// outperform their own position's average regardless of what that average is.
export const STANDARD_SCORING: Record<string, number> = {
    pass_yd: 0.04, pass_td: 4, pass_int: -2,
    rush_yd: 0.1,  rush_td: 6,
    rec:     1,    rec_yd:  0.1, rec_td: 6,
    fum_lost: -2,
};

// Wider than PERF_FACTOR's range since this reflects a real, measured
// structural difference (not an individual small-sample estimate) — but
// still clamped so an extreme league can't overwhelm the market-consensus
// anchor entirely.
const POSITION_FACTOR_MIN = 0.75;
const POSITION_FACTOR_MAX = 1.25;

// Final bound on the combined (individual x positional) adjustment. Set to
// the exact mathematical product of the two sub-factors' own clamps
// (PERF_FACTOR_MIN/MAX x POSITION_FACTOR_MIN/MAX) — this is a defensive
// backstop against arithmetic anomalies, not a routine cap. Setting it any
// tighter would silently collapse two legitimately different combined
// values (e.g. an elite WR and an elite RB in a league that favors RB) back
// down to the same ceiling, exactly re-introducing the bug this factor
// exists to fix.
const COMBINED_FACTOR_MIN = PERF_FACTOR_MIN * POSITION_FACTOR_MIN; // 0.6375
const COMBINED_FACTOR_MAX = PERF_FACTOR_MAX * POSITION_FACTOR_MAX; // 1.4375

/**
 * Real fantasy points per game under a specific league's scoring settings.
 * Generic dot-product: sum(scoringSettings[stat] * statsPerGame[stat]) for
 * every stat key present in both. Any scoring rule Sleeper exposes — not
 * just the ones we've explicitly coded for — is automatically included, as
 * long as the league's scoring_settings has a matching key.
 */
export function computeRealPoints(
    statsPerGame:    Record<string, number>,
    scoringSettings: Record<string, number>,
): number {
    let points = 0;
    for (const [stat, rate] of Object.entries(statsPerGame)) {
        const weight = scoringSettings[stat];
        if (weight !== undefined) points += rate * weight;
    }
    return points;
}

/**
 * How much a player's real per-game production under a league's real scoring
 * deviates from their position's average, smoothed via regression-to-mean and
 * clamped to a modest range so it nudges (not dominates) the market-consensus
 * base value. Returns 1.0 (no adjustment) when there's no positional baseline
 * to compare against, e.g. an empty or newly-added position group.
 */
export function computePerfFactor(
    playerRealPtsPerGame: number,
    positionAvgPtsPerGame: number,
    gamesPlayed: number,
): number {
    if (positionAvgPtsPerGame <= 0) return 1.0;

    const sampleWeight      = Math.min(1, gamesPlayed / FULL_SAMPLE_GAMES);
    const individualWeight  = REGRESSION_WEIGHT * sampleWeight;
    const meanWeight        = 1 - individualWeight;
    const blended           = individualWeight * playerRealPtsPerGame + meanWeight * positionAvgPtsPerGame;
    const ratio             = blended / positionAvgPtsPerGame;

    return Math.min(PERF_FACTOR_MAX, Math.max(PERF_FACTOR_MIN, ratio));
}

/**
 * Cross-positional signal: how much this league's real scoring shifts an
 * entire position's average production relative to a generic PPR baseline.
 * Applied uniformly to every player at the position (unlike perfFactor,
 * which varies per player) — this is what actually moves "WR vs RB" value
 * when a league has a structural rule like a rush-attempt or first-down
 * bonus, since that's a property of the position under this scoring format,
 * not of any individual player's performance.
 */
export function computePositionScoringFactor(
    leaguePosAvgPtsPerGame:   number,
    standardPosAvgPtsPerGame: number,
): number {
    if (standardPosAvgPtsPerGame <= 0) return 1.0;
    const ratio = leaguePosAvgPtsPerGame / standardPosAvgPtsPerGame;
    return Math.min(POSITION_FACTOR_MAX, Math.max(POSITION_FACTOR_MIN, ratio));
}

/** Combines the individual and positional factors into one bounded multiplier. */
export function combineScoringFactors(perfFactor: number, positionScoringFactor: number): number {
    const combined = perfFactor * positionScoringFactor;
    return Math.min(COMBINED_FACTOR_MAX, Math.max(COMBINED_FACTOR_MIN, combined));
}

/** Converts a season's raw stat totals into per-game rates. */
export function toStatsPerGame(
    rawStats: Record<string, number>,
    gamesPlayed: number,
): Record<string, number> {
    if (gamesPlayed <= 0) return {};
    const perGame: Record<string, number> = {};
    for (const [stat, total] of Object.entries(rawStats)) {
        if (typeof total === 'number') perGame[stat] = total / gamesPlayed;
    }
    return perGame;
}
