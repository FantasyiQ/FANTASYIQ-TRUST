// Shared types and value-computation helper for the dynamic player universe.
// Universe data comes from /api/players/universe and /api/players/delta.

export interface UniverseMeta {
    generatedAt:  string;       // ISO — when this response was generated
    ktcSyncedAt:  string | null; // ISO — when KTC data was last synced
    playerCount:  number;
}

export interface UniverseResponse {
    meta:    UniverseMeta;
    players: UniversePlayer[];
}

export interface UniversePlayer {
    name:            string;
    position:        string;
    team:            string | null;
    age:             number | null;
    dynasty:         number;       // 0–100 normalised KTC 1QB dynasty
    dynastySf:       number;       // 0–100 normalised KTC superflex dynasty
    redraft:         number;       // 0–100 normalised KTC 1QB redraft
    redraftSf:       number;       // 0–100 normalised KTC superflex redraft
    trend:           number | null;
    injuryStatus:    string | null;
    birthDate:       string | null;  // ISO date from Sleeper — runtime age source
    playerImageUrl:  string | null;  // Sleeper CDN headshot
}

// ── Delta types ──────────────────────────────────────────────────────────────
// Shared between /api/players/delta and UI consumers.

export interface DeltaEntry {
    name:     string;
    position: string;
    dynasty:  { current: number; prev: number; delta: number };
    redraft:  { current: number; prev: number; delta: number };
    team:          { current: string | null; prev: string | null } | null;
    injuryStatus:  { current: string | null; prev: string | null } | null;
    isNew:     boolean;
    isDropped: boolean;
}

export interface DeltaResponse {
    snapshotTakenAt: string | null;
    generatedAt:     string;
    totalChanged:    number;
    entries:         DeltaEntry[];
}

// ── Delta classification (0–100 FIQ scale) ────────────────────────────────────
// |Δ| < 1.0  → stable     (noise / rounding)
// |Δ| < 3.0  → minor      (small market shift)
// |Δ| < 6.0  → significant (notable move, worth surfacing)
// |Δ| ≥ 6.0  → major      (tier-crossing move, highlight)

export type DeltaClass = 'major' | 'significant' | 'minor' | 'stable';

export function classifyDelta(absD: number): DeltaClass {
    if (absD >= 6.0) return 'major';
    if (absD >= 3.0) return 'significant';
    if (absD >= 1.0) return 'minor';
    return 'stable';
}

/** Volatility label for UI badges — uses dynasty delta. */
export function playerVolatility(delta: DeltaEntry | undefined): 'volatile' | 'moving' | 'stable' | null {
    if (!delta || delta.isNew || delta.isDropped) return null;
    const cls = classifyDelta(Math.abs(delta.dynasty.delta));
    if (cls === 'major')       return 'volatile';
    if (cls === 'significant') return 'moving';
    return 'stable';
}

// ── Player comparison engine (0–100 FIQ scale, tier-aware) ────────────────────

export type CompareEdge = 'big' | 'clear' | 'small' | 'equal';
export type CompareDirection = 'A' | 'B' | 'equal';

export interface PlayerCompareResult {
    direction: CompareDirection;
    edge:      CompareEdge;
    label:     string;   // human-readable verdict
}

/**
 * Compare two player values on the 0–100 FIQ scale.
 * Tier difference takes precedence; within the same tier, value gap determines strength.
 *
 * Tier gap (any): "Advantage: [position/name] — higher tier"
 * Same tier gaps:
 *   Δ < 3  → "Essentially equal"
 *   Δ < 7  → "Small edge"
 *   Δ < 12 → "Clear edge"
 *   Δ ≥ 12 → "Big edge"
 */
export function comparePlayerValues(
    valueA: number, tierA: number,
    valueB: number, tierB: number,
): PlayerCompareResult {
    if (tierA !== tierB) {
        const direction: CompareDirection = tierA < tierB ? 'A' : 'B'; // lower tier # = better
        return {
            direction,
            edge:  'big',
            label: `Advantage: ${direction === 'A' ? 'Player A' : 'Player B'} — higher tier`,
        };
    }

    const delta = Math.abs(valueA - valueB);
    const direction: CompareDirection =
        valueA > valueB ? 'A' :
        valueB > valueA ? 'B' : 'equal';

    if (delta < 3)  return { direction: 'equal', edge: 'equal', label: 'Essentially equal' };
    if (delta < 7)  return { direction, edge: 'small', label: `Small edge — ${direction === 'A' ? 'Player A' : 'Player B'}` };
    if (delta < 12) return { direction, edge: 'clear', label: `Clear edge — ${direction === 'A' ? 'Player A' : 'Player B'}` };
    return { direction, edge: 'big', label: `Big edge — ${direction === 'A' ? 'Player A' : 'Player B'}` };
}

// ── Value computation ─────────────────────────────────────────────────────────
// Picks the right KTC value for a league format then applies PPR/size/scoring adjustments.
// Used in TradeEvaluator, LeagueDetailTabs, and LeagueTradeEvaluator.
export function computePlayerBaseValue(
    u: Pick<UniversePlayer, 'dynasty' | 'dynastySf' | 'redraft' | 'redraftSf'>,
    position: string,
    opts: {
        leagueType:  'Dynasty' | 'Redraft';
        superflex:   boolean;
        ppr:         0 | 0.5 | 1 | 'te_prem';
        leagueSize:  number;
        passTd?:     number;
        bonusRecTe?: number;
    },
): number {
    if (position === 'PICK') return 0; // picks have their own value calc

    let v = opts.leagueType === 'Dynasty'
        ? (opts.superflex ? u.dynastySf : u.dynasty)
        : (opts.superflex ? u.redraftSf : u.redraft);

    // PPR adjustment
    const cw: Record<string, number> = { WR: 0.55, RB: 0.35, TE: 0.65 };
    const w = cw[position] ?? 0;
    if (opts.ppr === 0 && w > 0)        v = Math.max(1, v - w * 10);
    else if (opts.ppr === 0.5 && w > 0) v = Math.max(1, v - w * 5);
    else if (opts.ppr === 'te_prem' && position === 'TE') v *= 1.12;

    // Scoring adjustments
    if (position === 'QB' && (opts.passTd ?? 4) >= 6)          v *= 1.08;
    if (position === 'TE' && (opts.bonusRecTe ?? 0) > 0)       v *= 1 + (opts.bonusRecTe ?? 0) * 0.06;

    // League size scarcity
    v *= 1 + (opts.leagueSize - 12) * 0.012;

    return Math.round(Math.max(1, v) * 10) / 10;
}
