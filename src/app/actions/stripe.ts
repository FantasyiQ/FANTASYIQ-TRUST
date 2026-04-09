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

    const leagueName = info.type === 'commissioner'
        ? (formData.get('leagueName') as string | null)?.trim() ?? ''
        : '';

    if (info.type === 'commissioner' && !leagueName) {
        throw new Error('League name is required for commissioner plans.');
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            email: true,
            name: true,
            stripeCustomerId: true,
            subscriptions: {
                where: { status: { in: ['active', 'trialing'] } },
                select: { id: true, type: true },
            },
        },
    });
    if (!user) redirect('/sign-in');

    const activePlayerSubs   = user.subscriptions.filter(s => s.type === 'player');
    const activeCommSubs     = user.subscriptions.filter(s => s.type === 'commissioner');
    const activeCommCount    = activeCommSubs.length;

    // Block a second player plan — use the upgrade flow instead
    if (info.type === 'player' && activePlayerSubs.length > 0) {
        throw new Error('You already have a Player plan. Use Upgrade to change tiers.');
    }

    // Volume discount coupon for commissioner plans
    let discountPct = 0;
    let couponId: string | undefined;
    if (info.type === 'commissioner') {
        if (activeCommCount >= 3) {
            discountPct = 25;
            couponId = 'MULTI_LEAGUE_25';
        } else if (activeCommCount >= 1) {
            discountPct = 15;
            couponId = 'MULTI_LEAGUE_15';
        }
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

    const sharedMeta = {
        userId: user.id,
        tier: info.tier,
        planType: info.type,
        leagueSize: info.leagueSize?.toString() ?? '',
        leagueName,
        discountPct: discountPct.toString(),
    };

    const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
        success_url: `${appUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl()}/pricing?tab=${info.type === 'commissioner' ? 'commissioner' : 'player'}`,
        metadata: sharedMeta,
        subscription_data: {
            metadata: sharedMeta,
        },
    });

    redirect(checkoutSession.url!);
}
