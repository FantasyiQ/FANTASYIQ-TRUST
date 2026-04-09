import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, planInfo } from '@/lib/stripe';
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

    // Look up user by email
    const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!dbUser) {
        return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the specific subscription to upgrade by its Stripe ID
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

    // For commissioner upgrades: must stay within the same league size
    if (newInfo.type === 'commissioner' && newInfo.leagueSize !== currentInfo?.leagueSize) {
        return Response.json({
            error: 'Commissioner plan upgrades must keep the same league size. Purchase a new plan for a different size.',
        }, { status: 400 });
    }

    // Rank check — block downgrades
    const currentRank = currentInfo ? tierRank(currentInfo) : 0;
    const newRank     = tierRank(newInfo);

    if (newRank <= currentRank) {
        return Response.json({
            error: 'Downgrades are not allowed. Cancel and resubscribe if you need a lower tier.',
        }, { status: 400 });
    }

    // Execute the upgrade
    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
        items: [{ id: stripeSub.items.data[0].id, price: priceId }],
        proration_behavior: 'always_invoice',
    });

    // Sync DB immediately — don't wait for webhook
    const updatedItem = updated.items.data[0];
    const periodStart = updatedItem?.current_period_start
        ? new Date(updatedItem.current_period_start * 1000) : null;
    const periodEnd = updatedItem?.current_period_end
        ? new Date(updatedItem.current_period_end * 1000) : null;

    const writes = [
        prisma.subscription.update({
            where: { stripeSubscriptionId },
            data: {
                tier: newInfo.tier,
                status: updated.status,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: updated.cancel_at_period_end,
            },
        }),
    ];

    // Only update user.subscriptionTier for player plan upgrades
    if (newInfo.type === 'player') {
        writes.push(
            prisma.user.update({
                where: { id: dbUser.id },
                data: { subscriptionTier: newInfo.tier },
                }) as unknown as typeof writes[0]
        );
    }

    await prisma.$transaction(writes);

    return Response.json({ success: true, tier: newInfo.tier });
}
