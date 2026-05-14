// FantasyIQ Trust — Unified Trade Evaluator
//
// Merges the offensive DTV system and the defensive ranking engine into a single
// 0–100 value scale for trade evaluation.
//
// Zero-mutation guarantee:
//   - This module NEVER modifies offenseValues or defenseValues.
//   - All normalization is computed in local scope and returned; nothing is cached.
//   - The offensive DTV table and the defensive valueScore table are read-only inputs.
//
// Design:
//   - Offensive values arrive as raw finalDtv numbers (KTC-based, roughly 0–100).
//   - Defensive values arrive already normalized to 0–100 (from defensiveEngine).
//   - Offensive values are z-score normalized to 0–100 to match the defensive scale.
//   - A unified lookup prefers defenseValues over offenseScore for any player ID.
//   - Trade evaluation sums unified values per side and applies the ±10% verdict rule.

// ── Types ─────────────────────────────────────────────────────────────────────

/** Raw offensive values: playerId → finalDtv (KTC-based, un-normalized). */
export type OffenseValues   = Readonly<Record<string, number>>;

/** Defensive values: playerId → valueScore (0–100, from defensiveEngine). */
export type DefenseValues   = Readonly<Record<string, number>>;

/** Normalized offensive values: playerId → offenseScore (0–100). */
export type NormalizedOffenseValues = Record<string, number>;

export type UnifiedTradeVerdict = 'fair' | 'teamA wins' | 'teamB wins';

export type UnifiedTradeResult = {
    teamAValue: number;       // sum of unified 0-100 scores for Team A's assets
    teamBValue: number;       // sum of unified 0-100 scores for Team B's assets
    difference: number;       // teamAValue - teamBValue
    verdict:    UnifiedTradeVerdict;
    details: {
        teamAPlayers: { id: string; name: string; value: number; source: 'offense' | 'defense' | 'unknown' }[];
        teamBPlayers: { id: string; name: string; value: number; source: 'offense' | 'defense' | 'unknown' }[];
    };
};

// ── Math helpers ───────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function statsFromValues(values: number[]): { mean: number; stdDev: number } {
    if (values.length === 0) return { mean: 0, stdDev: 1 };
    const avg      = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
    return { mean: avg, stdDev: Math.sqrt(variance) || 1 };
}

// ── Step 1: Normalize offensive values ────────────────────────────────────────

/**
 * Converts raw offensive DTV values (KTC-based) into a 0–100 scale that mirrors
 * the defensive engine's normalization (mean=50, 1 stdDev ≈ 15 points).
 *
 * Pure function — returns a new object, never mutates the input.
 */
export function normalizeOffensiveValues(
    offenseValues: OffenseValues,
): NormalizedOffenseValues {
    const entries = Object.entries(offenseValues);
    if (entries.length === 0) return {};

    const rawValues            = entries.map(([, v]) => v);
    const { mean, stdDev }     = statsFromValues(rawValues);
    const normalized: NormalizedOffenseValues = {};

    for (const [id, raw] of entries) {
        const z    = (raw - mean) / stdDev;
        normalized[id] = clamp(50 + 15 * z, 0, 100);
    }

    return normalized;
}

// ── Step 2: Unified value lookup ──────────────────────────────────────────────

export type GetPlayerValue = (playerId: string) => {
    value:  number;
    source: 'offense' | 'defense' | 'unknown';
};

/**
 * Returns a lookup function that prefers defensive values over normalized
 * offensive values for any given player ID.
 *
 * Defense-first ensures IDP/K/DEF use the league-aware engine; offensive
 * players use their normalized DTV without cross-contamination.
 */
export function buildGetPlayerValue(
    normalizedOffense: NormalizedOffenseValues,
    defenseValues:     DefenseValues,
): (id: string, name: string) => { value: number; source: 'offense' | 'defense' | 'unknown' } {
    console.log("defenseValues keys:", Object.keys(defenseValues));
    return (id: string, name: string) => {
        // Defense-first: look up by Sleeper player ID
        if (defenseValues[id] !== undefined) {
            return { value: defenseValues[id], source: 'defense' };
        }
        // Offense fallback: look up by player name (KTC universe is name-keyed)
        if (normalizedOffense[name] !== undefined) {
            return { value: normalizedOffense[name], source: 'offense' };
        }
        console.log("Missing defensive value for:", id, name);
        return { value: 0, source: 'unknown' };
    };
}

// ── Step 3 & 4: Trade evaluation ──────────────────────────────────────────────

/**
 * Evaluates a trade between two teams using both offensive DTV and defensive
 * ranking engine values on a unified 0–100 scale.
 *
 * Verdict thresholds:
 *   |difference| > 10% of average team value → one side wins
 *   Otherwise → fair
 *
 * @param teamAIds    Player/pick IDs for Team A's side of the trade
 * @param teamBIds    Player/pick IDs for Team B's side of the trade
 * @param offenseValues  Raw DTV values for all offensive players (un-normalized)
 * @param defenseValues  0–100 valueScores from the defensive ranking engine
 */
export function evaluateUnifiedTrade(
    teamAAssets:   { id: string; name: string }[],
    teamBAssets:   { id: string; name: string }[],
    offenseValues: OffenseValues,
    defenseValues: DefenseValues,
): UnifiedTradeResult {
    const normalizedOffense = normalizeOffensiveValues(offenseValues);
    const getPlayerValue    = buildGetPlayerValue(normalizedOffense, defenseValues);

    const resolveAssets = (assets: { id: string; name: string }[]) =>
        assets.map(({ id, name }) => {
            const { value, source } = getPlayerValue(id, name);
            return { id, name, value: Math.round(value * 10) / 10, source };
        });

    const teamAPlayers = resolveAssets(teamAAssets);
    const teamBPlayers = resolveAssets(teamBAssets);

    const teamAValue = Math.round(
        teamAPlayers.reduce((s, p) => s + p.value, 0) * 10
    ) / 10;
    const teamBValue = Math.round(
        teamBPlayers.reduce((s, p) => s + p.value, 0) * 10
    ) / 10;

    const difference = Math.round((teamAValue - teamBValue) * 10) / 10;

    // Ratio-based fairness: R = min(V1,V2) / max(V1,V2)
    // R ≥ 0.90 → fair (within 10%); otherwise one side wins
    const maxV = Math.max(teamAValue, teamBValue, 0.01);
    const R    = Math.min(teamAValue, teamBValue) / maxV;

    let verdict: UnifiedTradeVerdict;
    if (R >= 0.90) {
        verdict = 'fair';
    } else if (teamAValue > teamBValue) {
        verdict = 'teamA wins';
    } else {
        verdict = 'teamB wins';
    }

    return {
        teamAValue,
        teamBValue,
        difference,
        verdict,
        details: { teamAPlayers, teamBPlayers },
    };
}
