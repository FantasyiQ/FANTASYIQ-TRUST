'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, planInfo } from '@/lib/stripe';

function appUrl(): string {
    return (
        process.env.NEXTAUTH_URL ??
        process.env.AUTH_URL ??
        'http://localhost:3000'
    );
}

export async function createPortalSession(): Promise<never> {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) redirect('/dashboard');

    const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${appUrl()}/dashboard`,
    });

    redirect(portalSession.url);
}

export async function createCheckoutSession(formData: FormData): Promise<never> {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const priceId = formData.get('priceId') as string;
    if (!priceId) throw new Error('Missing priceId');

    const info = planInfo(priceId);
    if (!info) throw new Error('Invalid priceId');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            email: true,
            name: true,
            stripeCustomerId: true,
            subscriptions: {
                where: { type: 'player', status: { in: ['active', 'trialing'] } },
                select: { id: true },
            },
        },
    });
    if (!user) redirect('/sign-in');

    // Block a second player plan — use the upgrade flow instead
    if (info.type === 'player' && user.subscriptions.length > 0) {
        throw new Error('You already have a Player plan. Use Upgrade to change tiers.');
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email ?? undefined,
            name: user.name ?? undefined,
            metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: customerId },
        });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl()}/pricing`,
        metadata: {
            userId: user.id,
            tier: info.tier,
            planType: info.type,
            leagueSize: info.leagueSize?.toString() ?? '',
        },
        subscription_data: {
            metadata: {
                userId: user.id,
                tier: info.tier,
                planType: info.type,
                leagueSize: info.leagueSize?.toString() ?? '',
            },
        },
    });

    redirect(checkoutSession.url!);
}
