/**
 * Unified Team Needs model — the single source of truth for positional
 * needs/strengths across Draft Report, Trade Partners, and Mock Draft.
 *
 * Two axes, one vocabulary (see spec):
 *   depth    (quantity): empty | thin | deep   — count vs league-derived targets
 *   strength (quality):  weak  | average | strong — value vs league avg + absolute tier
 *
 * Label resolution (2×2 + Solid):
 *                 deep        thin        empty
 *   strong     Strength    Top-heavy    Need
 *   average    Solid       Shallow      Need
 *   weak       Shallow     Need         Need
 *
 * The module is value-source agnostic: callers resolve each player's `value`
 * from the right source per position class (DTV for offense/K, defensive
 * engine for IDP) and may mark positions depth-only (e.g. DEF) where no value
 * signal exists.
 */

export type NeedsLabel = 'Strength' | 'Solid' | 'Top-heavy' | 'Shallow' | 'Need';
export type DepthClass = 'deep' | 'thin' | 'empty';
export type StrengthClass = 'strong' | 'average' | 'weak';

export interface PositionVerdict {
    position: string;
    depth:    DepthClass;
    strength: StrengthClass;
    label:    NeedsLabel;
    urgency:  number;   // 0–1 (higher = bigger need); for mock bar / trade matching
    reason:   string;
    count:    number;   // players rostered at the position
}

// ── Constants (tunable) ──────────────────────────────────────────────────────

const NON_STARTER_SLOTS = new Set(['BN', 'IR', 'TAXI', 'IL', 'SFLEX']);

// Flex slot → eligible positions (shares split fractionally across these)
const FLEX_ELIGIBILITY: Record<string, readonly string[]> = {
    FLEX:       ['RB', 'WR', 'TE'],
    SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
    REC_FLEX:   ['WR', 'TE'],
    WRRB_FLEX:  ['RB', 'WR'],
};

// IDP roster-slot tokens → all bucket to a single 'IDP' position
const IDP_SLOTS = new Set(['DL','DE','DT','NT','LB','OLB','ILB','MLB','DB','CB','S','FS','SS','NB','IDP','IDPFLEX','IDP_FLEX']);
// IDP player positions → bucket to 'IDP'
export const IDP_PLAYER_POSITIONS = new Set(['DE','DT','NT','DL','EDGE','OLB','ILB','MLB','LB','CB','FS','SS','NB','S','DB','SAF']);

const BASE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

// Absolute "starter-quality" value thresholds (DTV-scale). IDP uses its own
// scale via the caller; DEF is depth-only.
export const DEFAULT_ABSOLUTE_THRESHOLD: Record<string, number> = {
    QB: 3000, RB: 1500, WR: 1500, TE: 1200,
};

const URGENCY_BY_LABEL: Record<NeedsLabel, number> = {
    Need: 0.9, 'Top-heavy': 0.65, Shallow: 0.55, Solid: 0.25, Strength: 0.1,
};

// Keep specialists/streamers from drafting early (preserves mock tuning)
export const DEFAULT_URGENCY_CAPS: Record<string, number> = { K: 0.35, DEF: 0.45 };

// ── Slot derivation (FLEX folded into eligible positions, fractional share) ──

export interface DerivedSlots {
    dedicated: Record<string, number>;  // position-locked starter slots (integer)
    starters:  Record<string, number>;  // effective demand = dedicated + flex share (fractional)
    scope:     string[];                 // positions this league actually starts
}

export function deriveSlots(rosterPositions: string[]): DerivedSlots {
    const dedicated: Record<string, number> = {};
    const flexShare: Record<string, number> = {};

    for (const raw of rosterPositions) {
        const slot = String(raw).trim();
        if (!slot || NON_STARTER_SLOTS.has(slot)) continue;

        if (BASE_POSITIONS.has(slot)) {
            dedicated[slot] = (dedicated[slot] ?? 0) + 1;
        } else if (IDP_SLOTS.has(slot)) {
            dedicated['IDP'] = (dedicated['IDP'] ?? 0) + 1;
        } else if (FLEX_ELIGIBILITY[slot]) {
            const elig = FLEX_ELIGIBILITY[slot];
            for (const pos of elig) flexShare[pos] = (flexShare[pos] ?? 0) + 1 / elig.length;
        }
        // unknown slots ignored
    }

    const starters: Record<string, number> = {};
    const scope = new Set<string>([...Object.keys(dedicated), ...Object.keys(flexShare)]);
    for (const pos of scope) {
        starters[pos] = (dedicated[pos] ?? 0) + (flexShare[pos] ?? 0);
    }
    return { dedicated, starters, scope: [...scope] };
}

/** Canonical positional value = sum of the top (starters+1) player values.
 *  Exported so callers can compute league averages with the identical metric. */
export function positionValue(values: number[], starters: number): number {
    const take = Math.max(1, Math.ceil(starters) + 1);
    return values.slice().sort((a, b) => b - a).slice(0, take).reduce((s, v) => s + (v || 0), 0);
}

// depthTarget = effective starters + 50% depth buffer (min +1)
export function depthTarget(starters: number): number {
    return starters + Math.max(1, Math.round(starters * 0.5));
}
const depthTargetFor = depthTarget;

function classifyDepth(count: number, dedicated: number, starters: number): DepthClass {
    if (count < Math.round(dedicated)) return 'empty';     // can't fill locked starters
    if (count >= depthTargetFor(starters)) return 'deep';
    return 'thin';
}

function classifyStrength(opts: {
    posValue: number;            // sum of top (starters+1) values
    leagueAvg?: number;          // avg posValue across league (relative); undefined = skip
    aboveThreshold: number;      // count of starter-quality players
    starters: number;
    depthOnly: boolean;          // no value signal (e.g. DEF) → always average
}): StrengthClass {
    if (opts.depthOnly) return 'average';
    const relStrong = opts.leagueAvg ? opts.posValue > opts.leagueAvg * 1.15 : false;
    const relWeak   = opts.leagueAvg ? opts.posValue < opts.leagueAvg * 0.85 : false;
    const hasStarters = opts.aboveThreshold >= Math.max(1, Math.round(opts.starters));

    // "strong" = genuinely above league average. Merely owning startable players
    // is NOT a strength — it only protects a group from reading "weak".
    if (relStrong) return 'strong';
    if (relWeak && !hasStarters)  return 'weak';
    return 'average';
}

export function resolveLabel(depth: DepthClass, strength: StrengthClass): NeedsLabel {
    if (depth === 'empty') return 'Need';
    if (strength === 'strong')  return depth === 'deep' ? 'Strength' : 'Top-heavy';
    if (strength === 'average') return depth === 'deep' ? 'Solid'    : 'Shallow';
    /* weak */                   return depth === 'deep' ? 'Shallow'  : 'Need';
}

function reasonFor(label: NeedsLabel, pos: string): string {
    switch (label) {
        case 'Strength':  return `Strong, deep ${pos} group`;
        case 'Solid':     return `Solid ${pos} — startable with depth`;
        case 'Top-heavy': return `Strong ${pos} starters, thin depth`;
        case 'Shallow':   return `${pos} has bodies but lacks a clear difference-maker`;
        case 'Need':      return `Thin/weak at ${pos} — a clear need`;
    }
}

// ── Main entry ───────────────────────────────────────────────────────────────

export interface AssessInput {
    /** Player values per position. Caller resolves `value` from the right
     *  source per position class (DTV for offense/K, defensive engine for IDP). */
    playersByPos: Record<string, number[]>;
    slots: DerivedSlots;
    leagueAvgByPos?: Record<string, number>;
    absoluteThreshold?: Record<string, number>;
    depthOnly?: Set<string>;                 // positions with no value signal (e.g. DEF)
    urgencyCaps?: Record<string, number>;    // e.g. K:0.35, DEF:0.45, IDP:<slot-scaled>
}

export function assessTeamNeeds(input: AssessInput): PositionVerdict[] {
    const {
        playersByPos, slots,
        leagueAvgByPos,
        absoluteThreshold = DEFAULT_ABSOLUTE_THRESHOLD,
        depthOnly = new Set(['DEF']),
        urgencyCaps = DEFAULT_URGENCY_CAPS,
    } = input;

    const verdicts: PositionVerdict[] = [];

    for (const pos of slots.scope) {
        const starters  = slots.starters[pos] ?? 0;
        const dedicated = slots.dedicated[pos] ?? 0;
        const values    = (playersByPos[pos] ?? []).slice().sort((a, b) => b - a);
        const count     = values.length;
        const posValue  = positionValue(values, starters);

        const thr            = absoluteThreshold[pos] ?? Infinity;
        const aboveThreshold = values.filter(v => v >= thr).length;

        const depth = classifyDepth(count, dedicated, starters);
        const strength = classifyStrength({
            posValue,
            leagueAvg: leagueAvgByPos?.[pos],
            aboveThreshold,
            starters,
            depthOnly: depthOnly.has(pos),
        });
        const label = resolveLabel(depth, strength);

        let urgency = URGENCY_BY_LABEL[label];
        if (urgencyCaps[pos] !== undefined) urgency = Math.min(urgency, urgencyCaps[pos]);

        verdicts.push({ position: pos, depth, strength, label, urgency, reason: reasonFor(label, pos), count });
    }

    return verdicts;
}
