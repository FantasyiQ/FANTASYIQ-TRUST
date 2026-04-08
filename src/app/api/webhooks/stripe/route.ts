import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { priceIdToTier } from '@/lib/stripe';
import type { SubscriptionTier } from '@prisma/client';

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
                const session = event.data.object as Stripe.Checkout.Session;
                const customerId = session.customer as string;
                const stripeSubId = session.subscription as string | null;
                const tier = session.metadata?.tier as SubscriptionTier | undefined;

                if (!customerId || !tier) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                // Set tier + status now. Period dates arrive via customer.subscription.updated
                // which Stripe fires immediately after this event.
                await prisma.$transaction([
                    prisma.user.update({
                        where: { id: user.id },
                        data: { subscriptionTier: tier },
                    }),
                    prisma.subscription.upsert({
                        where: { userId: user.id },
                        create: {
                            userId: user.id,
                            stripeSubscriptionId: stripeSubId,
                            stripeCustomerId: customerId,
                            tier,
                            status: 'active',
                        },
                        update: {
                            stripeSubscriptionId: stripeSubId,
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
                const customerId = sub.customer as string;
                const metaTier = sub.metadata?.tier as SubscriptionTier | undefined;
                const priceId = sub.items.data[0]?.price.id;
                const tier = metaTier ?? (priceId ? priceIdToTier(priceId) : null);

                if (!customerId || !tier) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                const item = sub.items.data[0];
                const periodStart = item?.current_period_start
                    ? new Date(item.current_period_start * 1000)
                    : null;
                const periodEnd = item?.current_period_end
                    ? new Date(item.current_period_end * 1000)
                    : null;

                await prisma.$transaction([
                    ...(sub.status === 'active' ? [
                        prisma.user.update({
                            where: { id: user.id },
                            data: { subscriptionTier: tier },
                        }),
                    ] : []),
                    prisma.subscription.upsert({
                        where: { userId: user.id },
                        create: {
                            userId: user.id,
                            stripeSubscriptionId: sub.id,
                            stripeCustomerId: customerId,
                            tier,
                            status: sub.status,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd: periodEnd,
                            cancelAtPeriodEnd: sub.cancel_at_period_end,
                        },
                        update: {
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

                await prisma.$transaction([
                    prisma.user.update({
                        where: { id: user.id },
                        data: { subscriptionTier: 'FREE' },
                    }),
                    prisma.subscription.upsert({
                        where: { userId: user.id },
                        create: {
                            userId: user.id,
                            stripeCustomerId: customerId,
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
