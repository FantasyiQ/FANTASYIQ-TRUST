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
    'price_1TLOTq2RJtQwVGBEPrbRFO8Z': { type: 'player', tier: 'PLAYER_PRO',           leagueSize: null },
    'price_1TLOUr2RJtQwVGBELefxoBWO': { type: 'player', tier: 'PLAYER_ALL_PRO',        leagueSize: null },
    'price_1TLOVi2RJtQwVGBEbReRAFI9': { type: 'player', tier: 'PLAYER_ELITE',          leagueSize: null },
    // Commissioner Pro
    'price_1TJevs2RJtQwVGBEJsY8pjzW': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 8  },
    'price_1TJevt2RJtQwVGBE0NH94Ln0': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 10 },
    'price_1TJevt2RJtQwVGBEhVTD6tSN': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 12 },
    'price_1TJevu2RJtQwVGBEONGWLyZ1': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 14 },
    'price_1TJevu2RJtQwVGBEBtvsN2wD': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 16 },
    'price_1TJevv2RJtQwVGBEHg2I2zIo': { type: 'commissioner', tier: 'COMMISSIONER_PRO', leagueSize: 32 },
    // Commissioner All-Pro
    'price_1TJevv2RJtQwVGBEzlCf01v2': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 8  },
    'price_1TLOHW2RJtQwVGBEzWGzCvry': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 10 },
    'price_1TLOK82RJtQwVGBEtsSKXDyN': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 12 },
    'price_1TJevx2RJtQwVGBEQnE3ySf2': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 14 },
    'price_1TJevy2RJtQwVGBERHTlBc8R': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 16 },
    'price_1TJevz2RJtQwVGBEy8BTKIEy': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: 32 },
    // Commissioner Elite
    'price_1TJevz2RJtQwVGBE0hnaSc7R': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 8  },
    'price_1TJew02RJtQwVGBEh7b4ouVh': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 10 },
    'price_1TLOQ62RJtQwVGBEf5Ku5PAw': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 12 },
    'price_1TJew12RJtQwVGBEW9pgN0sI': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 14 },
    'price_1TJew22RJtQwVGBEUzuZWBkD': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 16 },
    'price_1TJew22RJtQwVGBE0mw4lTfA': { type: 'commissioner', tier: 'COMMISSIONER_ELITE', leagueSize: 32 },
};

export function planInfo(priceId: string): PlanInfo | null {
    return PLAN_CATALOG[priceId] ?? null;
}

// Backwards-compat helper used by pricing page Stripe sync
export function priceIdToTier(priceId: string): SubscriptionTier | null {
    return PLAN_CATALOG[priceId]?.tier ?? null;
}
