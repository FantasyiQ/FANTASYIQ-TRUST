import { prisma } from '@/lib/prisma';
import { stripe, planInfo } from '@/lib/stripe';
import type { SubscriptionTier } from '@prisma/client';

function resolveSubType(
    tier: string | null | undefined,
    metaPlanType: string | null | undefined,
    catalogType: string | null | undefined,
): 'player' | 'commissioner' {
    if (tier?.startsWith('COMMISSIONER_')) return 'commissioner';
    if (tier?.startsWith('PLAYER_'))       return 'player';
    if (metaPlanType === 'commissioner')   return 'commissioner';
    if (catalogType  === 'commissioner')   return 'commissioner';
    return 'player';
}

const PLAYER_TIERS = new Set<SubscriptionTier>(['PLAYER_PRO', 'PLAYER_ALL_PRO', 'PLAYER_ELITE']);

/**
 * Reconciles the user's Stripe subscriptions with the DB.
 * Upserts any active/trialing/past_due subscriptions that are missing from the DB.
 * Called from the billing page and sync-subscription endpoint.
 * Returns the number of subscriptions upserted.
 */
export async function reconcileStripeSubscriptions(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { stripeCustomerId: true },
    });
    if (!user?.stripeCustomerId) return 0;

    let stripeSubs;
    try {
        stripeSubs = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status:   'all',
            limit:    20,
            expand:   ['data.items'],
        });
    } catch {
        return 0;
    }

    const relevant = stripeSubs.data.filter(s =>
        ['active', 'trialing', 'past_due'].includes(s.status),
    );
    if (relevant.length === 0) return 0;

    let synced = 0;

    for (const sub of relevant) {
        const priceId    = sub.items.data[0]?.price.id ?? null;
        const catalogInfo = priceId ? planInfo(priceId) : null;

        const metaTier     = sub.metadata?.tier as SubscriptionTier | undefined;
        const metaPlanType = sub.metadata?.planType ?? undefined;
        const tier: SubscriptionTier = metaTier ?? catalogInfo?.tier ?? 'FREE';
        const subType    = resolveSubType(tier, metaPlanType, catalogInfo?.type);
        const leagueSize = sub.metadata?.leagueSize
            ? parseInt(sub.metadata.leagueSize)
            : catalogInfo?.leagueSize ?? null;
        const leagueName = sub.metadata?.leagueName ?? null;

        const item        = sub.items.data[0];
        const periodStart = item?.current_period_start
            ? new Date(item.current_period_start * 1000) : null;
        const periodEnd   = item?.current_period_end
            ? new Date(item.current_period_end * 1000) : null;

        try {
            await prisma.$transaction([
                ...(subType === 'player' && PLAYER_TIERS.has(tier) && sub.status === 'active' ? [
                    prisma.user.update({
                        where: { id: userId },
                        data:  { subscriptionTier: tier },
                    }),
                ] : []),
                prisma.subscription.upsert({
                    where:  { stripeSubscriptionId: sub.id },
                    create: {
                        userId,
                        stripeSubscriptionId: sub.id,
                        stripeCustomerId:     user.stripeCustomerId!,
                        type:                 subType,
                        tier,
                        leagueSize,
                        leagueName,
                        status:               sub.status,
                        currentPeriodStart:   periodStart,
                        currentPeriodEnd:     periodEnd,
                        cancelAtPeriodEnd:    sub.cancel_at_period_end,
                    },
                    update: {
                        type:              subType,
                        tier,
                        leagueSize,
                        leagueName,
                        status:            sub.status,
                        currentPeriodStart: periodStart,
                        currentPeriodEnd:   periodEnd,
                        cancelAtPeriodEnd: sub.cancel_at_period_end,
                    },
                }),
            ]);
            synced++;
        } catch {
            // Non-fatal — continue with other subscriptions
        }
    }

    return synced;
}
