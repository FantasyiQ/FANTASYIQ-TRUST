/**
 * Dynasty Rookie Rankings — Types & Helpers
 *
 * Completely isolated from DTV, trade engine, and veteran scoring.
 * These values power rookie rankings, rookie tiers, and the rookie UI only.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RookieRankingsPlayer {
    id:          string;
    season:      string;
    playerName:  string;
    school:      string;
    position:    string;
    nflGrade:    number;
    fiqGrade:    number;
    eliteScore:  number;
    marketScore: number;
    overallPick: number;
    draftCap:    number;
    fiqScore:    number;
    fiqTier:     string;
}

// ── Official Tier Bands (Rookie Rankings only — NOT used for DTV) ─────────────

export const ROOKIE_TIER_BANDS = [
    { tier: 'Tier 1', label: 'Elite',         min: 85,   max: Infinity, description: 'Elite prospects, cornerstone dynasty assets.' },
    { tier: 'Tier 2', label: 'Strong',        min: 70,   max: 84.99,   description: 'Strong starters, high-floor contributors.' },
    { tier: 'Tier 3', label: 'Flex',          min: 60,   max: 69.99,   description: 'Flex-range players, role players, situational upside.' },
    { tier: 'Tier 4', label: 'Depth',         min: 50,   max: 59.99,   description: 'Depth, low hit-rate, opportunity-dependent.' },
    { tier: 'Tier 5', label: 'Developmental', min: 0,    max: 49.99,   description: 'Long-shots, taxi squad, developmental profiles.' },
] as const;

export type RookieFiQTier = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | 'Tier 5';

/** Compute tier from FiQScore using official bands. Used for new entries only — stored records use their persisted fiqTier. */
export function computeRookieFiQTier(fiqScore: number): RookieFiQTier {
    if (fiqScore >= 85) return 'Tier 1';
    if (fiqScore >= 70) return 'Tier 2';
    if (fiqScore >= 60) return 'Tier 3';
    if (fiqScore >= 50) return 'Tier 4';
    return 'Tier 5';
}

/** Tier badge CSS classes for the Rookie Rankings UI. */
export function rookieTierBadgeClass(tier: string): string {
    switch (tier) {
        case 'Tier 1': return 'bg-yellow-900/30 text-yellow-300 border-yellow-700/60';
        case 'Tier 2': return 'bg-blue-900/30 text-blue-300 border-blue-700/60';
        case 'Tier 3': return 'bg-green-900/30 text-green-300 border-green-700/60';
        case 'Tier 4': return 'bg-orange-900/20 text-orange-400 border-orange-700/50';
        case 'Tier 5': return 'bg-gray-800/60 text-gray-500 border-gray-700/50';
        default:       return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

/** Short label used inside the Tier badge pill. */
export function rookieTierLabel(tier: string): string {
    switch (tier) {
        case 'Tier 1': return 'T1';
        case 'Tier 2': return 'T2';
        case 'Tier 3': return 'T3';
        case 'Tier 4': return 'T4';
        case 'Tier 5': return 'T5';
        default:       return tier;
    }
}
