import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

/**
 * POST /api/stripe/sync-comm-discounts
 *
 * Fixes discount percentages for all active commissioner subscriptions
 * based on the order they were purchased (Stripe `created` timestamp).
 *
 *  Position 1 (oldest) → 0%  (full price)
 *  Position 2          → 10% (MULTI_LEAGUE_10)
 *  Position 3+         → 15% (MULTI_LEAGUE_15)
 */
export async function POST(_req: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            subscriptions: {
                where: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                select: { stripeSubscriptionId: true, discountPct: true },
            },
        },
    });
    if (!dbUser) return Response.json({ error: 'User not found' }, { status: 404 });

    const subs = dbUser.subscriptions.filter(s => !!s.stripeSubscriptionId);
    if (subs.length === 0) return Response.json({ updated: [] });

    // Fetch Stripe subscriptions (expand discounts) to get creation timestamps
    const stripeData = await Promise.all(
        subs.map(s => stripe.subscriptions.retrieve(s.stripeSubscriptionId!, { expand: ['discounts'] }))
    );

    // Sort oldest → newest
    const sorted = stripeData.sort((a, b) => a.created - b.created);

    const results: { id: string; discountPct: number; changed: boolean }[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const stripeSub = sorted[i];
        const targetPct =
            i === 0 ? 0 :
            i === 1 ? 10 :
            15;
        const couponId =
            targetPct === 10 ? 'MULTI_LEAGUE_10' :
            targetPct === 15 ? 'MULTI_LEAGUE_15' :
            null;

        const firstDiscount = Array.isArray(stripeSub.discounts) ? stripeSub.discounts[0] : null;
        const currentPct = typeof firstDiscount === 'object' && firstDiscount !== null
            ? Math.round((firstDiscount as { coupon?: { percent_off?: number } }).coupon?.percent_off ?? 0)
            : 0;
        const changed = currentPct !== targetPct;

        if (changed) {
            try {
                await stripe.subscriptions.update(stripeSub.id, {
                    discounts: couponId ? [{ coupon: couponId }] : [],
                });
                await prisma.subscription.update({
                    where: { stripeSubscriptionId: stripeSub.id },
                    data: { discountPct: targetPct },
                });
            } catch (err) {
                console.error(`[sync-comm-discounts] failed for ${stripeSub.id}:`, err);
            }
        }

        results.push({ id: stripeSub.id, discountPct: targetPct, changed });
    }

    return Response.json({ updated: results });
}
