import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe, planInfo } from '@/lib/stripe';

// Tier rank within each plan type — higher = more premium
const TIER_RANK: Record<string, number> = {
    // Player
    'price_1TJevr2RJtQwVGBEk9OZg70Q': 1,   // Player Pro
    'price_1TJevr2RJtQwVGBEjPGtY3xl': 2,   // Player All-Pro
    'price_1TJevs2RJtQwVGBEr9oJF91P': 3,   // Player Elite
    // Commissioner Pro
    'price_1TJevs2RJtQwVGBEJsY8pjzW': 10,  // Comm Pro 8T
    'price_1TJevt2RJtQwVGBE0NH94Ln0': 11,  // Comm Pro 10T
    'price_1TJevt2RJtQwVGBEhVTD6tSN': 12,  // Comm Pro 12T
    'price_1TJevu2RJtQwVGBEONGWLyZ1': 13,  // Comm Pro 14T
    'price_1TJevu2RJtQwVGBEBtvsN2wD': 14,  // Comm Pro 16T
    'price_1TJevv2RJtQwVGBEHg2I2zIo': 15,  // Comm Pro 32T
    // Commissioner All-Pro
    'price_1TJevv2RJtQwVGBEzlCf01v2': 20,  // Comm All-Pro 8T
    'price_1TJevw2RJtQwVGBEFZWHQ2U8': 21,  // Comm All-Pro 10T
    'price_1TJevx2RJtQwVGBEYS7UwvO7': 22,  // Comm All-Pro 12T
    'price_1TJevx2RJtQwVGBEQnE3ySf2': 23,  // Comm All-Pro 14T
    'price_1TJevy2RJtQwVGBERHTlBc8R': 24,  // Comm All-Pro 16T
    'price_1TJevz2RJtQwVGBEy8BTKIEy': 25,  // Comm All-Pro 32T
    // Commissioner Elite
    'price_1TJevz2RJtQwVGBE0hnaSc7R': 30,  // Comm Elite 8T
    'price_1TJew02RJtQwVGBEh7b4ouVh': 31,  // Comm Elite 10T
    'price_1TJew02RJtQwVGBE0sCYXfTw': 32,  // Comm Elite 12T
    'price_1TJew12RJtQwVGBEW9pgN0sI': 33,  // Comm Elite 14T
    'price_1TJew22RJtQwVGBEUzuZWBkD': 34,  // Comm Elite 16T
    'price_1TJew22RJtQwVGBE0mw4lTfA': 35,  // Comm Elite 32T
};

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
    const currentRank = TIER_RANK[currentPriceId] ?? 0;
    const newRank     = TIER_RANK[priceId] ?? 0;

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
