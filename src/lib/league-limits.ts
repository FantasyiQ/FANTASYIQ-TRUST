export const PLAYER_LEAGUE_LIMITS: Record<string, number> = {
    pro: 2,
    'all-pro': 5,
    elite: Infinity,
};

/** Returns the max connected leagues for a given tier string, or 0 for FREE/null. */
export function getLeagueLimit(tier: string | null): number {
    if (!tier) return 0;
    return PLAYER_LEAGUE_LIMITS[tier.toLowerCase()] ?? 0;
}

export function canAddLeague(tier: string | null, currentCount: number): boolean {
    return currentCount < getLeagueLimit(tier);
}

/** Maps SubscriptionTier enum values to league-limits keys. */
export function tierToLimitKey(tier: string): string | null {
    switch (tier) {
        case 'PLAYER_PRO':     return 'pro';
        case 'PLAYER_ALL_PRO': return 'all-pro';
        case 'PLAYER_ELITE':   return 'elite';
        default:               return null;
    }
}

export function nextTierName(tier: string): string | null {
    switch (tier) {
        case 'PLAYER_PRO':     return 'All-Pro';
        case 'PLAYER_ALL_PRO': return 'Elite';
        default:               return null;
    }
}

/** Converts any tier string to a 0–3 numeric level for cross-type comparison. */
export function tierLevel(tier: string): number {
    if (tier.includes('ELITE'))   return 3;
    if (tier.includes('ALL_PRO')) return 2;
    if (tier.includes('_PRO'))    return 1;
    return 0;
}

/**
 * Returns the effective player-equivalent tier for a specific league.
 *
 * Rules:
 * - If the league is NOT connected to the user's player plan, only the player
 *   tier applies (no uplift from the commissioner plan).
 * - If the league IS connected, take the higher level of playerTier and
 *   the commissioner plan tier for that league, and return the matching
 *   PLAYER_* tier so that player-feature gating is consistent.
 */
export function effectiveTierForLeague(
    playerTier: string,
    commSubTierForLeague: string | null,
    leagueConnectedToPlayerPlan: boolean,
): string {
    const playerLvl = tierLevel(playerTier);
    const commLvl   = leagueConnectedToPlayerPlan && commSubTierForLeague
        ? tierLevel(commSubTierForLeague)
        : 0;
    const level = Math.max(playerLvl, commLvl);
    switch (level) {
        case 3: return 'PLAYER_ELITE';
        case 2: return 'PLAYER_ALL_PRO';
        case 1: return 'PLAYER_PRO';
        default: return 'FREE';
    }
}
