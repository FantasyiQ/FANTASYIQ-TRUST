import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { stripe, planInfo } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import type { SubscriptionTier } from '@prisma/client';

const PLAYER_TIERS = new Set<SubscriptionTier>(['PLAYER_PRO', 'PLAYER_ALL_PRO', 'PLAYER_ELITE']);

// Derive plan type using the tier prefix as the authoritative signal.
// Metadata alone can be missing or wrong; the tier string never lies.
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

export async function POST(request: NextRequest): Promise<Response> {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch {
        return Response.json({ error: 'Invalid webhook signature' }, { status: 400 });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const cs = event.data.object as Stripe.Checkout.Session;
                const customerId   = cs.customer as string;
                const stripeSubId  = cs.subscription as string | null;
                const metaTier       = cs.metadata?.tier as SubscriptionTier | undefined;
                const metaPlanType   = cs.metadata?.planType ?? 'player';
                const metaSize       = cs.metadata?.leagueSize ? parseInt(cs.metadata.leagueSize) : null;
                const metaLeagueName = cs.metadata?.leagueName ?? null;
                const metaDiscountPct = cs.metadata?.discountPct ? parseInt(cs.metadata.discountPct) : null;

                if (!customerId || !stripeSubId) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                // Derive from PLAN_CATALOG if metadata is absent (e.g. manually created subs)
                const tier: SubscriptionTier = metaTier ?? 'FREE';
                const subType  = resolveSubType(tier, metaPlanType, null);
                const leagueSize = metaSize;

                await prisma.$transaction([
                    // Only update user.subscriptionTier for genuine player plans.
                    // Double-guard: subType AND tier must both confirm it's a player plan.
                    ...(subType === 'player' && PLAYER_TIERS.has(tier) ? [
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
                        },
                        update: {
                            type: subType,
                            leagueSize,
                            leagueName: metaLeagueName,
                            discountPct: metaDiscountPct,
                            tier,
                            status: 'active',
                            cancelAtPeriodEnd: false,
                        },
                    }),
                ]);
                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object as Stripe.Subscription;
                const customerId   = sub.customer as string;
                const priceId      = sub.items.data[0]?.price.id;
                const metaTier     = sub.metadata?.tier as SubscriptionTier | undefined;
                const metaPlanType = sub.metadata?.planType;
                const metaSize     = sub.metadata?.leagueSize ? parseInt(sub.metadata.leagueSize) : null;

                if (!customerId) break;

                // Derive from PLAN_CATALOG
                const info     = priceId ? planInfo(priceId) : null;
                const tier     = metaTier ?? info?.tier ?? null;
                const subType  = resolveSubType(tier, metaPlanType, info?.type);
                const leagueSize = metaSize ?? info?.leagueSize ?? null;

                if (!tier) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                const item = sub.items.data[0];
                const periodStart = item?.current_period_start
                    ? new Date(item.current_period_start * 1000) : null;
                const periodEnd = item?.current_period_end
                    ? new Date(item.current_period_end * 1000) : null;

                await prisma.$transaction([
                    // Only update user.subscriptionTier for active player plans.
                    // Double-guard: subType AND tier must both confirm it's a player plan.
                    ...(subType === 'player' && PLAYER_TIERS.has(tier as SubscriptionTier) && sub.status === 'active' ? [
                        prisma.user.update({
                            where: { id: user.id },
                            data: { subscriptionTier: tier as SubscriptionTier },
                        }),
                    ] : []),
                    // Reset player tier when player plan is no longer active
                    ...(subType === 'player' && sub.status !== 'active' && sub.status !== 'trialing' ? [
                        prisma.user.update({
                            where: { id: user.id },
                            data: { subscriptionTier: 'FREE' },
                        }),
                    ] : []),
                    prisma.subscription.upsert({
                        where: { stripeSubscriptionId: sub.id },
                        create: {
                            userId: user.id,
                            stripeSubscriptionId: sub.id,
                            stripeCustomerId: customerId,
                            type: subType,
                            leagueSize,
                            tier,
                            status: sub.status,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd: periodEnd,
                            cancelAtPeriodEnd: sub.cancel_at_period_end,
                        },
                        update: {
                            type: subType,
                            leagueSize,
                            tier,
                            status: sub.status,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd: periodEnd,
                            cancelAtPeriodEnd: sub.cancel_at_period_end,
                        },
                    }),
                ]);
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object as Stripe.Subscription;
                const customerId = sub.customer as string;
                if (!customerId) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                // Look up the subscription record to know its type
                const subRecord = await prisma.subscription.findUnique({
                    where: { stripeSubscriptionId: sub.id },
                    select: { type: true },
                });

                await prisma.$transaction([
                    // Only reset subscriptionTier for player plan cancellations
                    ...(subRecord?.type === 'player' ? [
                        prisma.user.update({
                            where: { id: user.id },
                            data: { subscriptionTier: 'FREE' },
                        }),
                    ] : []),
                    prisma.subscription.upsert({
                        where: { stripeSubscriptionId: sub.id },
                        create: {
                            userId: user.id,
                            stripeSubscriptionId: sub.id,
                            stripeCustomerId: customerId,
                            type: subRecord?.type ?? 'player',
                            tier: 'FREE',
                            status: 'canceled',
                        },
                        update: {
                            status: 'canceled',
                            cancelAtPeriodEnd: false,
                        },
                    }),
                ]);
                break;
            }
        }
    } catch (err) {
        console.error(`Webhook handler error [${event.type}]:`, err);
        return Response.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    return Response.json({ received: true });
}
