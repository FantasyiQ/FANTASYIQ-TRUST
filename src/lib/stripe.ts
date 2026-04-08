export { stripe, PLAYER_TIERS, COMMISSIONER_PRICING } from '../../lib/stripe';

import catalog from '../../stripe-catalog-ids.json';
import type { SubscriptionTier } from '@prisma/client';

// Map every price ID in the catalog to its SubscriptionTier
const priceToTier = new Map<string, SubscriptionTier>(
    catalog.map((item) => {
        const name = item.name;
        let tier: SubscriptionTier;
        if (name.startsWith('Player Pro'))           tier = 'PLAYER_PRO';
        else if (name.startsWith('Player All-Pro'))  tier = 'PLAYER_ALL_PRO';
        else if (name.startsWith('Player Elite'))    tier = 'PLAYER_ELITE';
        else if (name.startsWith('Commissioner Pro'))     tier = 'COMMISSIONER_PRO';
        else if (name.startsWith('Commissioner All-Pro')) tier = 'COMMISSIONER_ALL_PRO';
        else                                              tier = 'COMMISSIONER_ELITE';
        return [item.priceId, tier] as [string, SubscriptionTier];
    })
);

export function priceIdToTier(priceId: string): SubscriptionTier | null {
    return priceToTier.get(priceId) ?? null;
}
