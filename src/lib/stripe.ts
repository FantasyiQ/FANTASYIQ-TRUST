export { stripe, PLAYER_TIERS, COMMISSIONER_PRICING } from '../../lib/stripe';

import type { SubscriptionTier } from '@prisma/client';

export interface PlanInfo {
    type: 'player' | 'commissioner';
    tier: SubscriptionTier;
    leagueSize: number | null;
}

// Single source of truth for every price ID in the catalog.
// Used by checkout, webhook, and upgrade to derive plan type + tier + size.
export const PLAN_CATALOG: Record<string, PlanInfo> = {
    // Player plans
    'price_1TItfCEBsodxydiKIUs9HmrQ': { type: 'player', tier: 'PLAYER_PRO',           leagueSize: null },
    'price_1TIu8rEBsodxydiKxRR3BpuQ': { type: 'player', tier: 'PLAYER_ALL_PRO',        leagueSize: null },
    'price_1TIugZEBsodxydiK0EmKVzLE': { type: 'player', tier: 'PLAYER_ELITE',          leagueSize: null },
    // Commissioner Pro
    'price_1TKR7NEBsodxydiK8W5zSUEa': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 8  },
    'price_1TKR7NEBsodxydiKvCC8OyHi': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 10 },
    'price_1TKR7OEBsodxydiKBK76qaRM': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 12 },
    'price_1TKR7OEBsodxydiK4q2bdv2V': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 14 },
    'price_1TKR7OEBsodxydiK0MrH2tV0': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 16 },
    'price_1TKR7OEBsodxydiKs1DWWhfD': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 32 },
    // Commissioner All-Pro
    'price_1TKR7PEBsodxydiK1LmrN9JR': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 8  },
    'price_1TKR7PEBsodxydiKARylslJo': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 10 },
    'price_1TKR7PEBsodxydiKbnLFf1KM': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 12 },
    'price_1TKR7QEBsodxydiKaRhx1cHs': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 14 },
    'price_1TKR7QEBsodxydiKaOa9Jk07': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 16 },
    'price_1TKR7QEBsodxydiK9afvbEwc': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 32 },
    // Commissioner Elite
    'price_1TKR7REBsodxydiKao69fWtE': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 8  },
    'price_1TKR7REBsodxydiKWZVoV0eN': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 10 },
    'price_1TKR7REBsodxydiKWTXv8lOV': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 12 },
    'price_1TKR7REBsodxydiKUK53zLc5': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 14 },
    'price_1TKR7SEBsodxydiKUoHf0RMN': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 16 },
    'price_1TKR7SEBsodxydiKxk8oOGSP': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 32 },
};

export function planInfo(priceId: string): PlanInfo | null {
    return PLAN_CATALOG[priceId] ?? null;
}

// Backwards-compat helper used by pricing page Stripe sync
export function priceIdToTier(priceId: string): SubscriptionTier | null {
    return PLAN_CATALOG[priceId]?.tier ?? null;
}
