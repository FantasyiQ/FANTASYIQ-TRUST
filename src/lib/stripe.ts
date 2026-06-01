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
    // ── Test Mode ─────────────────────────────────────────────────────────────
    // Player plans (test)
    'price_1TLieF2RJtQwVGBEPpjA7NUp': { type: 'player', tier: 'PLAYER_PRO',     leagueSize: null },
    'price_1TLieF2RJtQwVGBEW2cynnDi': { type: 'player', tier: 'PLAYER_ALL_PRO', leagueSize: null },
    'price_1TLieG2RJtQwVGBELTvoH65N': { type: 'player', tier: 'PLAYER_ELITE',   leagueSize: null },
    // Commissioner Pro (test)
    'price_1TLieG2RJtQwVGBEgreYGMge': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 8 },
    'price_1TLieH2RJtQwVGBEo8qIXXDx': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 10 },
    'price_1TLieH2RJtQwVGBEeomBOQFE': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 12 },
    'price_1TLieH2RJtQwVGBEPMYKLwjx': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 14 },
    'price_1TLieH2RJtQwVGBEmkDkAnJA': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 16 },
    'price_1TLieI2RJtQwVGBEaRt2aAm0': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 32 },
    // Commissioner All-Pro (test)
    'price_1TLieI2RJtQwVGBE4fiPrR70': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 8 },
    'price_1TLieI2RJtQwVGBE4e5w3ik6': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 10 },
    'price_1TLieJ2RJtQwVGBEpiDQ0x4T': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 12 },
    'price_1TLieJ2RJtQwVGBEsmObsNYs': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 14 },
    'price_1TLieJ2RJtQwVGBEj6Zxy0U9': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 16 },
    'price_1TLieJ2RJtQwVGBEhUvylFkr': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 32 },
    // Commissioner Elite (test)
    'price_1TLieK2RJtQwVGBEn6I8w8gW': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 8 },
    'price_1TLieK2RJtQwVGBEk0uZtiRP': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 10 },
    'price_1TLieK2RJtQwVGBEji3is0ZV': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 12 },
    'price_1TLieL2RJtQwVGBEyt1NTFef': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 14 },
    'price_1TLieL2RJtQwVGBEV9OKQKwq': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 16 },
    'price_1TLieL2RJtQwVGBE9rGNUHqY': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 32 },
    // ── Live Mode ─────────────────────────────────────────────────────────────
    // Player plans (live)
    'price_1TdaU32RJtQwVGBE29X8OXJr': { type: 'player', tier: 'PLAYER_PRO',     leagueSize: null },
    'price_1TdaU32RJtQwVGBEEqXfwPAY': { type: 'player', tier: 'PLAYER_ALL_PRO', leagueSize: null },
    'price_1TdaU42RJtQwVGBE9bo3uKZS': { type: 'player', tier: 'PLAYER_ELITE',   leagueSize: null },
    // Commissioner Pro (live)
    'price_1TdaUu2RJtQwVGBEKnxmmLyV': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 8 },
    'price_1TdaUu2RJtQwVGBE1nHiB9bp': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 10 },
    'price_1TdaUu2RJtQwVGBEyfsYVFhy': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 12 },
    'price_1TdaUv2RJtQwVGBECAjeSPB7': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 14 },
    'price_1TdaUv2RJtQwVGBESKhTPasu': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 16 },
    'price_1TdaUv2RJtQwVGBEcNjocQ9I': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 32 },
    // Commissioner All-Pro (live)
    'price_1TdaUw2RJtQwVGBEY5mSAgVd': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 8 },
    'price_1TdaUw2RJtQwVGBE3Z2FDlr2': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 10 },
    'price_1TdaUw2RJtQwVGBET24DOREW': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 12 },
    'price_1TdaUw2RJtQwVGBEuDgcM0DE': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 14 },
    'price_1TdaUx2RJtQwVGBEoAWaFmgc': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 16 },
    'price_1TdaUx2RJtQwVGBEfxTks3Mv': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 32 },
    // Commissioner Elite (live)
    'price_1TdaUx2RJtQwVGBEOzDxXCcW': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 8 },
    'price_1TdaUy2RJtQwVGBE61Coj8Nc': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 10 },
    'price_1TdaUy2RJtQwVGBEVurn54N9': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 12 },
    'price_1TdaUy2RJtQwVGBEvpi1Zo9A': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 14 },
    'price_1TdaUy2RJtQwVGBEY3YgY66l': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 16 },
    'price_1TdaUz2RJtQwVGBEPaabRilV': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 32 },
};

export function planInfo(priceId: string): PlanInfo | null {
    return PLAN_CATALOG[priceId] ?? null;
}

// Backwards-compat helper used by pricing page Stripe sync
export function priceIdToTier(priceId: string): SubscriptionTier | null {
    return PLAN_CATALOG[priceId]?.tier ?? null;
}
