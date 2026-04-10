import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, planInfo, COMMISSIONER_PRICING } from '@/lib/stripe';
import type { PlanInfo } from '@/lib/stripe';

// Derive a comparable rank from PlanInfo so this never goes stale with price ID changes.
function tierRank(info: PlanInfo): number {
    const tierBase: Record<string, number> = {
        PLAYER_PRO:           10,
        PLAYER_ALL_PRO:       20,
        PLAYER_ELITE:         30,
        COMMISSIONER_PRO:     40,
        COMMISSIONER_ALL_PRO: 50,
        COMMISSIONER_ELITE:   60,
    };
    return (tierBase[info.tier] ?? 0);
}

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

// After any commissioner plan change, ensure the multi-league discount sits
// on the cheapest active plan. Removes it from more expensive plans.
async function rebalanceCommDiscounts(userId: string): Promise<void> {
    const allSubs = await prisma.subscription.findMany({
        where: { userId, type: 'commissioner', status: { in: ['active', 'trialing'] } },
        select: { stripeSubscriptionId: true, tier: true, leagueSize: true, discountPct: true },
    });

    if (allSubs.length < 2) {
        // Only 1 plan — no multi-league discount applies; remove any stale discount
        for (const sub of allSubs) {
            if ((sub.discountPct ?? 0) > 0 && sub.stripeSubscriptionId) {
                try {
                    await stripe.subscriptions.update(sub.stripeSubscriptionId, { discounts: [] });
                    await prisma.subscription.update({
                        where: { stripeSubscriptionId: sub.stripeSubscriptionId },
                        data: { discountPct: 0 },
                    });
                } catch { /* non-fatal */ }
            }
        }
        return;
    }

    const targetPct = allSubs.length >= 4 ? 25 : 15;
    const couponId  = allSubs.length >= 4 ? 'MULTI_LEAGUE_25' : 'MULTI_LEAGUE_15';

    // Sort cheapest first
    const sorted = [...allSubs]
        .map(s => ({ ...s, price: commPrice(s.tier as string, s.leagueSize) }))
        .sort((a, b) => a.price - b.price);

    const cheapest = sorted[0];

    for (const sub of sorted) {
        if (!sub.stripeSubscriptionId) continue;
        const isCheapest = sub.stripeSubscriptionId === cheapest.stripeSubscriptionId;
        const currentPct = sub.discountPct ?? 0;

        if (isCheapest && currentPct !== targetPct) {
            // Apply or upgrade discount on the cheapest plan
            try {
                await stripe.subscriptions.update(sub.stripeSubscriptionId, {
                    discounts: [{ coupon: couponId }],
                });
                await prisma.subscription.update({
                    where: { stripeSubscriptionId: sub.stripeSubscriptionId },
                    data: { discountPct: targetPct },
                });
            } catch { /* non-fatal */ }
        } else if (!isCheapest && currentPct > 0) {
            // Remove discount from plans that aren't cheapest
            try {
                await stripe.subscriptions.update(sub.stripeSubscriptionId, { discounts: [] });
                await prisma.subscription.update({
                    where: { stripeSubscriptionId: sub.stripeSubscriptionId },
                    data: { discountPct: 0 },
                });
            } catch { /* non-fatal */ }
        }
    }
}

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as { priceId?: string; stripeSubscriptionId?: string };
    const { priceId, stripeSubscriptionId } = body;

    if (!priceId || !stripeSubscriptionId) {
        return Response.json({ error: 'priceId and stripeSubscriptionId are required' }, { status: 400 });
    }

    const newInfo = planInfo(priceId);
    if (!newInfo) {
        return Response.json({ error: 'Invalid priceId' }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!dbUser) {
        return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const subRecord = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId },
        select: { id: true, userId: true, type: true, status: true },
    });

    if (!subRecord) {
        return Response.json({ error: 'Subscription not found' }, { status: 404 });
    }
    if (subRecord.userId !== dbUser.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (subRecord.status !== 'active' && subRecord.status !== 'trialing') {
        return Response.json({ error: 'Subscription is not active' }, { status: 400 });
    }
    if (subRecord.type !== newInfo.type) {
        return Response.json({ error: 'Cannot switch between player and commissioner plans via upgrade' }, { status: 400 });
    }

    // Get current price from Stripe (authoritative)
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const currentPriceId = stripeSub.items.data[0]?.price.id;
    if (!currentPriceId) {
        return Response.json({ error: 'Could not determine current plan' }, { status: 500 });
    }

    const currentInfo = planInfo(currentPriceId);

    // Commissioner upgrades must stay within the same league size
    if (newInfo.type === 'commissioner' && newInfo.leagueSize !== currentInfo?.leagueSize) {
        return Response.json({
            error: 'Commissioner plan upgrades must keep the same league size. Purchase a new plan for a different size.',
        }, { status: 400 });
    }

    // Block downgrades
    const currentRank = currentInfo ? tierRank(currentInfo) : 0;
    const newRank     = tierRank(newInfo);
    if (newRank <= currentRank) {
        return Response.json({
            error: 'Downgrades are not allowed. Cancel and resubscribe if you need a lower tier.',
        }, { status: 400 });
    }

    // Execute the upgrade (strip existing discounts — rebalance handles reassignment)
    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
        items: [{ id: stripeSub.items.data[0].id, price: priceId }],
        proration_behavior: 'always_invoice',
        discounts: [],  // clear discount; rebalance will re-apply to cheapest plan
    });

    // Sync DB
    const updatedItem = updated.items.data[0];
    const periodStart = updatedItem?.current_period_start
        ? new Date(updatedItem.current_period_start * 1000) : null;
    const periodEnd = updatedItem?.current_period_end
        ? new Date(updatedItem.current_period_end * 1000) : null;

    const subUpdate = prisma.subscription.update({
        where: { stripeSubscriptionId },
        data: {
            tier: newInfo.tier,
            discountPct: 0,  // cleared; rebalance sets correct value
            status: updated.status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: updated.cancel_at_period_end,
        },
    });

    if (newInfo.type === 'player') {
        await prisma.$transaction([
            subUpdate,
            prisma.user.update({
                where: { id: dbUser.id },
                data: { subscriptionTier: newInfo.tier },
            }),
        ]);
    } else {
        await subUpdate;
    }

    // Rebalance discounts across all commissioner plans now that prices have changed
    if (newInfo.type === 'commissioner') {
        await rebalanceCommDiscounts(dbUser.id);
    }

    return Response.json({ success: true, tier: newInfo.tier });
}
