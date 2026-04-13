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
    'price_1TLieF2RJtQwVGBEPpjA7NUp': { type: 'player', tier: 'PLAYER_PRO', leagueSize: null },
    'price_1TLieF2RJtQwVGBEW2cynnDi': { type: 'player', tier: 'PLAYER_ALL_PRO', leagueSize: null },
    'price_1TLieG2RJtQwVGBELTvoH65N': { type: 'player', tier: 'PLAYER_ELITE', leagueSize: null },
    // Commissioner Pro
    'price_1TLieG2RJtQwVGBEgreYGMge': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 8 },
    'price_1TLieH2RJtQwVGBEo8qIXXDx': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 10 },
    'price_1TLieH2RJtQwVGBEeomBOQFE': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 12 },
    'price_1TLieH2RJtQwVGBEPMYKLwjx': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 14 },
    'price_1TLieH2RJtQwVGBEmkDkAnJA': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 16 },
    'price_1TLieI2RJtQwVGBEaRt2aAm0': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 32 },
    // Commissioner All-Pro
    'price_1TLieI2RJtQwVGBE4fiPrR70': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 8 },
    'price_1TLieI2RJtQwVGBE4e5w3ik6': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 10 },
    'price_1TLieJ2RJtQwVGBEpiDQ0x4T': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 12 },
    'price_1TLieJ2RJtQwVGBEsmObsNYs': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 14 },
    'price_1TLieJ2RJtQwVGBEj6Zxy0U9': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 16 },
    'price_1TLieJ2RJtQwVGBEhUvylFkr': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 32 },
    // Commissioner Elite
    'price_1TLieK2RJtQwVGBEn6I8w8gW': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 8 },
    'price_1TLieK2RJtQwVGBEk0uZtiRP': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 10 },
    'price_1TLieK2RJtQwVGBEji3is0ZV': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 12 },
    'price_1TLieL2RJtQwVGBEyt1NTFef': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 14 },
    'price_1TLieL2RJtQwVGBEV9OKQKwq': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 16 },
    'price_1TLieL2RJtQwVGBE9rGNUHqY': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 32 },
};

export function planInfo(priceId: string): PlanInfo | null {
    return PLAN_CATALOG[priceId] ?? null;
}

// Backwards-compat helper used by pricing page Stripe sync
export function priceIdToTier(priceId: string): SubscriptionTier | null {
    return PLAN_CATALOG[priceId]?.tier ?? null;
}
