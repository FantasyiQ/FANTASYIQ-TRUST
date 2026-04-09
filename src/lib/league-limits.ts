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
