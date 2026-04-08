import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, priceIdToTier } from '@/lib/stripe';
import PricingClient from './PricingClient';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
    const session = await auth();

    let activeSub: { tier: string; stripeSubscriptionId: string } | null = null;

    if (session?.user?.email) {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                subscriptionTier: true,
                subscription: {
                    select: { status: true, stripeSubscriptionId: true },
                },
            },
        });

        const sub = user?.subscription;
        if (
            user &&
            sub?.stripeSubscriptionId &&
            (sub.status === 'active' || sub.status === 'trialing')
        ) {
            // Read the current price directly from Stripe — this is always authoritative.
            // The DB tier can be stale if previous upgrade API calls failed to write back.
            let tier: string = user.subscriptionTier;
            try {
                const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
                const currentPriceId = stripeSub.items.data[0]?.price.id;
                const stripeTier = currentPriceId ? priceIdToTier(currentPriceId) : null;
                if (stripeTier) {
                    tier = stripeTier;
                    // Passively heal the DB if it's out of sync (non-blocking)
                    if (stripeTier !== user.subscriptionTier) {
                        prisma.user.update({
                            where: { email: session.user.email },
                            data: { subscriptionTier: stripeTier },
                        }).catch(() => {});
                    }
                }
            } catch {
                // Stripe unreachable — fall back to DB tier
            }

            activeSub = {
                tier,
                stripeSubscriptionId: sub.stripeSubscriptionId,
            };
        }
    }

    return <PricingClient activeSub={activeSub} />;
}
