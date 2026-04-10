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
                    discountPct: true,
                    stripeSubscriptionId: true,
                },
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

    // ── Volume discount ───────────────────────────────────────────────────────
    // Discount applies to the plan being purchased at checkout.
    // 1st league = full price, 2nd = 10%, 3rd+ = 15%
    let discountPct = 0;
    let couponId: string | undefined;

    if (info.type === 'commissioner') {
        if (activeCommCount >= 2) {
            discountPct = 15;
            couponId = 'MULTI_LEAGUE_15';
        } else if (activeCommCount === 1) {
            discountPct = 10;
            couponId = 'MULTI_LEAGUE_10';
        }
    }

    // When crossing the 2nd→3rd threshold, upgrade any existing 10% subs to 15%.
    if (info.type === 'commissioner' && activeCommCount >= 2) {
        for (const sub of activeCommSubs) {
            if ((sub.discountPct ?? 0) < 15 && sub.stripeSubscriptionId) {
                try {
                    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
                        discounts: [{ coupon: 'MULTI_LEAGUE_15' }],
                    });
                    await prisma.subscription.update({
                        where: { stripeSubscriptionId: sub.stripeSubscriptionId },
                        data: { discountPct: 15 },
                    });
                } catch { /* non-fatal */ }
            }
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
    if (discountPct > 0)        sharedMeta.discountPct  = discountPct.toString();

    let checkoutUrl: string;
    try {
        const isAllProComm = info.tier === 'COMMISSIONER_ALL_PRO';
        const cs = await stripe.checkout.sessions.create({
            customer: customerId!,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
            // Allow promo codes only on All-Pro commissioner plans
            // (couponId and allow_promotion_codes are mutually exclusive in Stripe)
            ...(!couponId && isAllProComm ? { allow_promotion_codes: true } : {}),
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
