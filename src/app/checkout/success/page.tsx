import { redirect } from 'next/navigation';
import { stripe, planInfo } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import type { SubscriptionTier } from '@prisma/client';

export default async function CheckoutSuccessPage({
    searchParams,
}: {
    searchParams: Promise<{ session_id?: string }>;
}) {
    const { session_id } = await searchParams;
    if (!session_id) redirect('/pricing');

    // Expand subscription so we have all the data we need in one call.
    const cs = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['subscription'],
    });

    if (cs.payment_status !== 'paid' && cs.status !== 'complete') {
        redirect('/pricing');
    }

    const customerId  = cs.customer as string | null;
    const sub         = cs.subscription as import('stripe').default.Subscription | null;
    const stripeSubId = sub?.id ?? null;

    // Fulfill synchronously so the dashboard always reflects the purchase.
    if (customerId && stripeSubId && sub) {
        const user = await prisma.user.findUnique({
            where: { stripeCustomerId: customerId },
            select: { id: true },
        });

        if (user) {
            const metaTier       = cs.metadata?.tier as SubscriptionTier | undefined;
            const metaPlanType   = (cs.metadata?.planType ?? 'player') as 'player' | 'commissioner';
            const metaSize       = cs.metadata?.leagueSize ? parseInt(cs.metadata.leagueSize) : null;
            const metaLeagueName = cs.metadata?.leagueName ?? null;
            const metaDiscountPct = cs.metadata?.discountPct ? parseInt(cs.metadata.discountPct) : null;

            // Fall back to PLAN_CATALOG if metadata is somehow missing
            const priceId = sub.items.data[0]?.price.id ?? null;
            const catalogInfo = priceId ? planInfo(priceId) : null;

            const tier: SubscriptionTier = metaTier ?? catalogInfo?.tier ?? 'FREE';
            const subType  = metaPlanType ?? catalogInfo?.type ?? 'player';
            const leagueSize = metaSize ?? catalogInfo?.leagueSize ?? null;

            const item = sub.items.data[0];
            const periodStart = item?.current_period_start
                ? new Date(item.current_period_start * 1000) : null;
            const periodEnd = item?.current_period_end
                ? new Date(item.current_period_end * 1000) : null;

            await prisma.$transaction([
                ...(subType === 'player' ? [
                    prisma.user.update({
                        where: { id: user.id },
                        data: { subscriptionTier: tier },
                    }),
                ] : []),
                prisma.subscription.upsert({
                    where: { stripeSubscriptionId: stripeSubId },
                    create: {
                        userId: user.id,
                        stripeSubscriptionId: stripeSubId,
                        stripeCustomerId: customerId,
                        type: subType,
                        leagueSize,
                        leagueName: metaLeagueName,
                        discountPct: metaDiscountPct,
                        tier,
                        status: 'active',
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                    },
                    update: {
                        type: subType,
                        leagueSize,
                        leagueName: metaLeagueName,
                        discountPct: metaDiscountPct,
                        tier,
                        status: 'active',
                        currentPeriodStart: periodStart,
                        currentPeriodEnd: periodEnd,
                        cancelAtPeriodEnd: false,
                    },
                }),
            ]);
        }
    }

    // DB is now up to date — redirect straight to dashboard.
    redirect('/dashboard');
}
