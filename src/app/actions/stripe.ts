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

export async function syncCommDiscounts(): Promise<void> {
    const session = await auth();
    if (!session?.user?.email) return;

    const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            subscriptions: {
                where: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                select: { stripeSubscriptionId: true },
            },
        },
    });
    const subs = (dbUser?.subscriptions ?? []).filter(s => !!s.stripeSubscriptionId);
    if (subs.length === 0) return;

    // Fetch Stripe subs (expand discounts) to get creation timestamps, sort oldest → newest
    const stripeData = await Promise.all(
        subs.map(s => stripe.subscriptions.retrieve(s.stripeSubscriptionId!, { expand: ['discounts'] }))
    );
    const sorted = stripeData.sort((a, b) => a.created - b.created);

    for (let i = 0; i < sorted.length; i++) {
        const stripeSub = sorted[i];
        const targetPct = i === 0 ? 0 : i === 1 ? 10 : 15;
        const couponId  = targetPct === 10 ? 'MULTI_LEAGUE_10' : targetPct === 15 ? 'MULTI_LEAGUE_15' : null;
        const firstDiscount = Array.isArray(stripeSub.discounts) ? stripeSub.discounts[0] : null;
        const currentPct = typeof firstDiscount === 'object' && firstDiscount !== null
            ? Math.round((firstDiscount as { coupon?: { percent_off?: number } }).coupon?.percent_off ?? 0)
            : 0;
        if (currentPct === targetPct) continue;
        try {
            await stripe.subscriptions.update(stripeSub.id, {
                discounts: couponId ? [{ coupon: couponId }] : [],
            });
            await prisma.subscription.update({
                where: { stripeSubscriptionId: stripeSub.id },
                data: { discountPct: targetPct },
            });
        } catch { /* non-fatal */ }
    }
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
                select: {
                    id: true,
                    type: true,
                    tier: true,
                    leagueSize: true,
                    stripeSubscriptionId: true,
                },
            },
        },
    });
    if (!user) redirect('/sign-in');

    const activePlayerSubs = user.subscriptions.filter(s => s.type === 'player');

    // Block a second player plan — redirect to pricing with upgrade note
    if (info.type === 'player' && activePlayerSubs.length > 0) {
        redirect('/pricing?error=already-subscribed');
    }

    // Get or create Stripe customer — verify the stored ID is valid in the current Stripe mode
    let customerId = user.stripeCustomerId;
    if (customerId) {
        try {
            const existing = await stripe.customers.retrieve(customerId);
            if ((existing as { deleted?: boolean }).deleted) customerId = null;
        } catch {
            // Customer doesn't exist in this mode (e.g. test ID used against live keys)
            customerId = null;
        }
    }
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
            const msg = err instanceof Error ? err.message : String(err);
            redirect('/pricing?error=checkout-failed&detail=' + encodeURIComponent(msg));
        }
    }

    // Build metadata
    const sharedMeta: Record<string, string> = {
        userId:   user.id,
        tier:     info.tier,
        planType: info.type,
    };
    if (info.leagueSize != null) sharedMeta.leagueSize = info.leagueSize.toString();
    if (leagueName)              sharedMeta.leagueName  = leagueName;

    let checkoutUrl: string;
    try {
        const cs = await stripe.checkout.sessions.create({
            customer: customerId!,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            // allow_promotion_codes lets anyone enter a promo code (e.g. ALLPRO100).
            // Stripe doesn't allow discounts[] and allow_promotion_codes together,
            // so we always use allow_promotion_codes and apply multi-league discounts
            // to the subscription after checkout via the webhook.
            allow_promotion_codes: true,
            success_url: `${appUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${appUrl()}/pricing?tab=${info.type === 'commissioner' ? 'commissioner' : 'player'}`,
            metadata: sharedMeta,
            subscription_data: { metadata: sharedMeta },
        });
        checkoutUrl = cs.url!;
    } catch (err) {
        console.error('[createCheckoutSession] stripe.checkout.sessions.create failed:', err);
        const msg = err instanceof Error ? err.message : String(err);
        redirect('/pricing?error=checkout-failed&detail=' + encodeURIComponent(msg));
    }

    redirect(checkoutUrl);
}
