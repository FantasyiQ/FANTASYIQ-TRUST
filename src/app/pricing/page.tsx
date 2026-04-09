import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, priceIdToTier } from '@/lib/stripe';
import PricingClient from './PricingClient';
import type { PlayerSub, CommSub } from './types';

export const dynamic = 'force-dynamic';

export default async function PricingPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const { tab } = await searchParams;
    const defaultTab = tab === 'commissioner' ? 'commissioner' : 'player';

    const session = await auth();

    let playerSub: PlayerSub | null = null;
    let commSubs: CommSub[] = [];

    if (session?.user?.email) {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                subscriptionTier: true,
                subscriptions: {
                    where: { status: { in: ['active', 'trialing'] } },
                    select: { type: true, tier: true, leagueSize: true, stripeSubscriptionId: true },
                },
            },
        });

        if (user) {
            // Player sub — verify against Stripe for accuracy
            const rawPlayerSub = user.subscriptions.find(s => s.type === 'player');
            if (rawPlayerSub?.stripeSubscriptionId) {
                let tier: string = user.subscriptionTier;
                try {
                    const stripeSub = await stripe.subscriptions.retrieve(rawPlayerSub.stripeSubscriptionId);
                    const currentPriceId = stripeSub.items.data[0]?.price.id;
                    const stripeTier = currentPriceId ? priceIdToTier(currentPriceId) : null;
                    if (stripeTier) {
                        tier = stripeTier;
                        // Passively heal stale user.subscriptionTier
                        if (stripeTier !== user.subscriptionTier) {
                            prisma.user.update({
                                where: { email: session.user.email },
                                data: { subscriptionTier: stripeTier },
                            }).catch(() => {});
                        }
                    }
                } catch {
                    // Stripe unreachable — fall back to DB
                }
                playerSub = { tier, stripeSubscriptionId: rawPlayerSub.stripeSubscriptionId };
            }

            // Commissioner subs — read from DB (webhook keeps these accurate)
            commSubs = user.subscriptions
                .filter(s => s.type === 'commissioner' && s.stripeSubscriptionId && s.leagueSize)
                .map(s => ({
                    tier: s.tier,
                    leagueSize: s.leagueSize!,
                    stripeSubscriptionId: s.stripeSubscriptionId!,
                }));
        }
    }

    return (
        <PricingClient
            playerSub={playerSub}
            commSubs={commSubs}
            defaultTab={defaultTab as 'player' | 'commissioner'}
        />
    );
}
