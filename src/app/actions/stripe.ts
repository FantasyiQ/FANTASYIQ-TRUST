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

    const priceId = formData.get('priceId') as string | null;
    if (!priceId) redirect('/pricing?error=invalid-plan');

    const info = planInfo(priceId);
    if (!info) redirect('/pricing?error=invalid-plan');

    const leagueName = info.type === 'commissioner'
        ? (formData.get('leagueName') as string | null)?.trim() ?? ''
        : '';

    if (info.type === 'commissioner' && !leagueName) {
        redirect('/pricing?tab=commissioner&error=league-name-required');
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

    const activePlayerSubs = user.subscriptions.filter(s => s.type === 'player');
    const activeCommSubs   = user.subscriptions.filter(s => s.type === 'commissioner');
    const activeCommCount  = activeCommSubs.length;

    // Block a second player plan — redirect to pricing with upgrade note
    if (info.type === 'player' && activePlayerSubs.length > 0) {
        redirect('/pricing?error=already-subscribed');
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
        try {
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
        } catch (err) {
            console.error('[createCheckoutSession] stripe.customers.create failed:', err);
            const msg=err instanceof Error?err.message:String(err);redirect('/pricing?error=checkout-failed&detail='+encodeURIComponent(msg));
        }
    }

    // Build metadata — omit keys with empty/null values so Stripe never
    // receives empty strings (which cause InvalidRequestError).
    const sharedMeta: Record<string, string> = {
        userId: user.id,
        tier:   info.tier,
        planType: info.type,
    };
    if (info.leagueSize != null) sharedMeta.leagueSize = info.leagueSize.toString();
    if (leagueName)              sharedMeta.leagueName  = leagueName;
    if (discountPct > 0)        sharedMeta.discountPct  = discountPct.toString();

    let checkoutUrl: string;
    try {
        const cs = await stripe.checkout.sessions.create({
            customer: customerId!,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
            success_url: `${appUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${appUrl()}/pricing?tab=${info.type === 'commissioner' ? 'commissioner' : 'player'}`,
            metadata: sharedMeta,
            subscription_data: { metadata: sharedMeta },
        });
        checkoutUrl = cs.url!;
    } catch (err) {
        console.error('[createCheckoutSession] stripe.checkout.sessions.create failed:', err);
        const msg=err instanceof Error?err.message:String(err);redirect('/pricing?error=checkout-failed&detail='+encodeURIComponent(msg));
    }

    redirect(checkoutUrl);
}
