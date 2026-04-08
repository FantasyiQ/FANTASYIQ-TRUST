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
                // Prefer metadata.tier set at checkout creation time
                const tier = session.metadata?.tier as SubscriptionTier | undefined;

                if (customerId && tier) {
                    await prisma.user.update({
                        where: { stripeCustomerId: customerId },
                        data: { subscriptionTier: tier },
                    });
                }
                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object as Stripe.Subscription;
                const customerId = sub.customer as string;
                // Fall back to price ID mapping for plan changes initiated outside checkout
                const metaTier = sub.metadata?.tier as SubscriptionTier | undefined;
                const priceId = sub.items.data[0]?.price.id;
                const tier = metaTier ?? (priceId ? priceIdToTier(priceId) : null);

                if (customerId && tier && sub.status === 'active') {
                    await prisma.user.update({
                        where: { stripeCustomerId: customerId },
                        data: { subscriptionTier: tier },
                    });
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object as Stripe.Subscription;
                const customerId = sub.customer as string;

                if (customerId) {
                    await prisma.user.update({
                        where: { stripeCustomerId: customerId },
                        data: { subscriptionTier: 'FREE' },
                    });
                }
                break;
            }
        }
    } catch (err) {
        console.error(`Webhook handler error [${event.type}]:`, err);
        return Response.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    return Response.json({ received: true });
}
