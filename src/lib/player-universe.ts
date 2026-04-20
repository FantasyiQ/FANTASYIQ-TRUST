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

// Volatility classification based on dynasty delta magnitude.
export function playerVolatility(delta: DeltaEntry | undefined): 'volatile' | 'moving' | 'stable' | null {
    if (!delta || delta.isNew || delta.isDropped) return null;
    const d = Math.abs(delta.dynasty.delta);
    if (d >= 10) return 'volatile';
    if (d >= 4)  return 'moving';
    return 'stable';
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
