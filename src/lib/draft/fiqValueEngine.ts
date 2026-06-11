/**
 * FantasyiQ Trust Value Engine
 *
 * dynastyValue = raw dynasty trade value. No transformation, no composite override.
 * The engine assigns tiers based on value thresholds and computes
 * analytics (opportunityScore, schemeScore, composite) for player cards,
 * insights, and dashboards — but never overwrites dynastyValue.
 *
 * Architecture:
 *   dynastyValue      → value backbone (untouched)
 *   Composite score   → analytics only (not the value)
 *   Tier              → assigned from value thresholds (7-tier system)
 */

// ── Dynasty value tier thresholds (7-tier system) ──────────────────────────────
// Tuned to the actual distribution so positional shapes, scarcity,
// class strength, and mock draft ordering all behave correctly.

function computeDtvTier(dynastyVal: number): number {
    if (dynastyVal >= 7000) return 1;  // Elite
    if (dynastyVal >= 5500) return 2;  // Star
    if (dynastyVal >= 4000) return 3;  // Starter
    if (dynastyVal >= 2500) return 4;  // Flex
    if (dynastyVal >= 1500) return 5;  // Depth
    if (dynastyVal >= 800)  return 6;  // Fringe
    return 7;                           // Stash
}

// ── Analytics helpers (kept for player cards, insights, future features) ───────
// These are NOT used to set dynastyValue.

function injuryPenalty(status: string | null | undefined): number {
    if (!status) return 0;
    const s = status.toUpperCase();
    if (s === 'IR' || s === 'PUP' || s === 'SUS') return 15;
    if (s === 'O' || s === 'OUT')                  return 10;
    if (s === 'D')                                 return 7;
    if (s === 'Q')                                 return 3;
    return 0;
}

function depthScore(rank: number | undefined): number {
    if (!rank) return 50;
    return Math.max(0, Math.min(100, (5 - rank) / 4 * 100));
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function zNorm(values: number[]): (v: number) => number {
    if (values.length === 0) return () => 50;
    const mean     = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev   = Math.sqrt(variance) || 1;
    return (v: number) => clamp(50 + 15 * ((v - mean) / stdDev), 0, 100);
}

// ── Analytics-only composite score (per position, 0–100) ─────────────────────
// Useful for player cards, insights, scouting reports.
// NEVER assigned back to dynastyValue.

export function computeCompositeScores<T extends {
    playerId:          string;
    dynastyValue:      number;
    position:          string;
    opportunityScore?: number;
    schemeScore?:      number;
    depthChartRank?:   number;
    injuryStatus?:     string | null;
}>(players: T[]): Map<string, number> {
    const byPosition = new Map<string, T[]>();
    for (const p of players) {
        const g = byPosition.get(p.position) ?? [];
        g.push(p);
        byPosition.set(p.position, g);
    }

    const result = new Map<string, number>();

    for (const posGroup of byPosition.values()) {
        const toDtvNorm = zNorm(posGroup.map(p => p.dynastyValue));

        const rawComposite = posGroup.map(p => {
            const dtv         = toDtvNorm(p.dynastyValue);
            const opportunity = (p.opportunityScore ?? 0.5)  * 100;
            const scheme      = (p.schemeScore      ?? 0.65) * 100;
            const depth       = depthScore(p.depthChartRank);
            const penalty     = injuryPenalty(p.injuryStatus);
            return { id: p.playerId, v: Math.max(0, dtv * 0.50 + opportunity * 0.30 + scheme * 0.10 + depth * 0.10 - penalty) };
        });

        const toCompNorm = zNorm(rawComposite.map(x => x.v));
        for (const { id, v } of rawComposite) {
            result.set(id, Math.round(toCompNorm(v) * 10) / 10);
        }
    }

    return result;
}

// ── Main export: assign value tiers, leave dynastyValue untouched ──────────────

/**
 * Assigns value tiers to each player.
 * dynastyValue is NEVER modified — it stays as the raw scraped value.
 * All analytics (composite, scheme, opportunity) remain in their own fields.
 */
export function applyFIQValues<T extends {
    playerId:     string;
    dynastyValue: number;
    tier:         number;
}>(players: T[]): T[] {
    return players.map(p => ({
        ...p,
        tier: computeDtvTier(p.dynastyValue),
    }));
}
