import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, priceIdToTier } from '@/lib/stripe';
import PricingClient from './PricingClient';
import type { PlayerSub, CommSub } from './types';

export const dynamic = 'force-dynamic';

export default async function PricingPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string; error?: string; detail?: string; size?: string; leagueName?: string }>;
}) {
    const { tab, error, detail, size, leagueName: leagueNameParam } = await searchParams;
    const defaultTab = tab === 'commissioner' ? 'commissioner' : 'player';
    const defaultSize = size ? parseInt(size) : null;
    const defaultLeagueName = leagueNameParam ? decodeURIComponent(leagueNameParam) : '';
    const alreadySubscribed = error === 'already-subscribed';
    const checkoutError =
        error === 'checkout-failed'       ? `Something went wrong starting checkout.${detail ? ` ${decodeURIComponent(detail)}` : ' Please try again.'}` :
        error === 'invalid-plan'          ? 'Invalid plan selected. Please try again.' :
        error === 'league-name-required'  ? 'Enter your league name before selecting a commissioner plan.' :
        null;

    const session = await auth();

    let playerSub: PlayerSub | null = null;
    let commSubs: CommSub[] = [];
    let activePlayerLeagueCount = 0;

    if (session?.user?.email) {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                subscriptionTier: true,
                subscriptions: {
                    where: { status: { in: ['active', 'trialing'] } },
                    select: { type: true, tier: true, leagueSize: true, leagueName: true, stripeSubscriptionId: true },
                },
                _count: { select: { connectedLeagues: true } },
            },
        });

        if (user) {
            activePlayerLeagueCount = user._count.connectedLeagues;

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
                    leagueName: s.leagueName ?? null,
                    stripeSubscriptionId: s.stripeSubscriptionId!,
                }));
        }
    }

    return (
        <PricingClient
            playerSub={playerSub}
            commSubs={commSubs}
            activeCommCount={commSubs.length}
            activePlayerLeagueCount={activePlayerLeagueCount}
            defaultTab={defaultTab as 'player' | 'commissioner'}
            defaultSize={defaultSize}
            defaultLeagueName={defaultLeagueName}
            alreadySubscribed={alreadySubscribed}
            checkoutError={checkoutError}
        />
    );
}
