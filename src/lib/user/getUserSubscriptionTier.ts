import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, priceIdToTier } from '@/lib/stripe';
import { tierLevel } from '@/lib/league-limits';

/** Returns the current user's effective subscription tier level (0–3). */
export async function getUserSubscriptionTier(): Promise<number> {
    const session = await auth();
    if (!session?.user?.id) return 0;

    const sub = await prisma.subscription.findFirst({
        where:   { userId: session.user.id, type: 'player', status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
        select:  { tier: true, stripeSubscriptionId: true },
    });
    if (!sub) return 0;

    let tier = sub.tier;
    if (sub.stripeSubscriptionId) {
        try {
            const stripeSub  = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
            const priceId    = stripeSub.items.data[0]?.price.id;
            const stripeTier = priceId ? priceIdToTier(priceId) : null;
            if (stripeTier) tier = stripeTier;
        } catch { /* fall back to DB tier */ }
    }

    return tierLevel(tier);
}
