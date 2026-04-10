'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, planInfo, COMMISSIONER_PRICING } from '@/lib/stripe';

function appUrl(): string {
    return (
        process.env.NEXTAUTH_URL ??
        process.env.AUTH_URL ??
        'http://localhost:3000'
    );
}

// Look up annual price (in dollars) for any commissioner tier + size combo.
function commPrice(tier: string, leagueSize: number | null): number {
    if (!leagueSize) return 0;
    const key =
        tier === 'COMMISSIONER_PRO'     ? 'pro'
      : tier === 'COMMISSIONER_ALL_PRO' ? 'all_pro'
      : tier === 'COMMISSIONER_ELITE'   ? 'elite'
      : null;
    if (!key) return 0;
    return (COMMISSIONER_PRICING[key].sizes as Record<number, number>)[leagueSize] ?? 0;
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
    // Discount always lands on the CHEAPEST plan in the portfolio to prevent
    // gaming (stacking cheap plans to discount an expensive one).
    let discountPct = 0;
    let couponId: string | undefined;

    // 1st league = full price, 2nd = 10%, 3rd+ = 15%
    if (info.type === 'commissioner') {
        if (activeCommCount >= 2) {
            discountPct = 15;
            couponId = 'MULTI_LEAGUE_15';
        } else if (activeCommCount === 1) {
            discountPct = 10;
            couponId = 'MULTI_LEAGUE_10';
        }
    }

    // Price of the plan being purchased right now
    const newPlanPrice = commPrice(info.tier, info.leagueSize);

    // If a discount applies, check whether an existing plan is cheaper.
    // If so, redirect the discount there instead of the new (expensive) plan.
    let applyDiscountToExistingSubId: string | null = null;

    if (discountPct > 0 && couponId && info.type === 'commissioner') {
        const cheapestExisting = activeCommSubs
            .map(s => ({
                stripeSubscriptionId: s.stripeSubscriptionId,
                price: commPrice(s.tier as string, s.leagueSize),
                currentDiscountPct: s.discountPct ?? 0,
            }))
            .sort((a, b) => a.price - b.price)
            .find(s => s.price < newPlanPrice && s.currentDiscountPct < discountPct);

        if (cheapestExisting?.stripeSubscriptionId) {
            applyDiscountToExistingSubId = cheapestExisting.stripeSubscriptionId;
            couponId    = undefined;
            discountPct = 0;
        }

        // When crossing the 2nd→3rd threshold, upgrade existing 10% → 15%.
        if (activeCommCount >= 2) {
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

    // Apply discount to cheapest existing sub if needed
    if (applyDiscountToExistingSubId) {
        const coupon = activeCommCount >= 2 ? 'MULTI_LEAGUE_15' : 'MULTI_LEAGUE_10';
        const pct    = activeCommCount >= 2 ? 15 : 10;
        try {
            await stripe.subscriptions.update(applyDiscountToExistingSubId, { discounts: [{ coupon }] });
            await prisma.subscription.update({
                where: { stripeSubscriptionId: applyDiscountToExistingSubId },
                data: { discountPct: pct },
            });
        } catch (err) {
            console.error('[createCheckoutSession] discount redirect failed:', err);
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
        const msg = err instanceof Error ? err.message : String(err);
        redirect('/pricing?error=checkout-failed&detail=' + encodeURIComponent(msg));
    }

    redirect(checkoutUrl);
}
