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
    'price_1TKPEOEBsodxydiKWSmivBYk': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 8  },
    'price_1TKPEPEBsodxydiKW5vUexFE': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 10 },
    'price_1TKPEPEBsodxydiKEHArdbqq': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 12 },
    'price_1TKPEQEBsodxydiKb8mCg4pE': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 14 },
    'price_1TKPEQEBsodxydiKlpK67sPh': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 16 },
    'price_1TKPEREBsodxydiKe0F8kHYb': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 32 },
    // Commissioner All-Pro
    'price_1TKPEREBsodxydiKtP6Sot7B': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 8  },
    'price_1TKPESEBsodxydiKXEDqiOnQ': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 10 },
    'price_1TKPESEBsodxydiK0mG9lDYl': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 12 },
    'price_1TKPETEBsodxydiKm3iRGbaZ': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 14 },
    'price_1TKPEUEBsodxydiKPdDYTJR9': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 16 },
    'price_1TKPEUEBsodxydiK8X64yYeX': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 32 },
    // Commissioner Elite
    'price_1TKPEVEBsodxydiK0cg4vEfo': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 8  },
    'price_1TKPEVEBsodxydiKvHZKEB4c': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 10 },
    'price_1TKPEWEBsodxydiK5fK1fCvs': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 12 },
    'price_1TKPEWEBsodxydiKE1zlkygj': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 14 },
    'price_1TKPEXEBsodxydiKDfjqO3Tn': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 16 },
    'price_1TKPEXEBsodxydiKvPjGFU39': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 32 },
};

export function planInfo(priceId: string): PlanInfo | null {
    return PLAN_CATALOG[priceId] ?? null;
}

// Backwards-compat helper used by pricing page Stripe sync
export function priceIdToTier(priceId: string): SubscriptionTier | null {
    return PLAN_CATALOG[priceId]?.tier ?? null;
}
