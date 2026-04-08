import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { priceIdToTier } from '@/lib/stripe';

// Rank map — higher = more expensive/premium. Downgrades (same or lower rank) are blocked.
const TIER_RANK: Record<string, number> = {
    // Player tiers
    'price_1TJevr2RJtQwVGBEk9OZg70Q': 1,   // Player Pro $5.99
    'price_1TJevr2RJtQwVGBEjPGtY3xl': 2,   // Player All-Pro $10.99
    'price_1TJevs2RJtQwVGBEr9oJF91P': 3,   // Player Elite $17.99
    // Commissioner Pro tiers
    'price_1TJevs2RJtQwVGBEJsY8pjzW': 10,  // Comm Pro 8T $39.99
    'price_1TJevt2RJtQwVGBE0NH94Ln0': 11,  // Comm Pro 10T $49.99
    'price_1TJevt2RJtQwVGBEhVTD6tSN': 12,  // Comm Pro 12T $59.99
    'price_1TJevu2RJtQwVGBEONGWLyZ1': 13,  // Comm Pro 14T $69.99
    'price_1TJevu2RJtQwVGBEBtvsN2wD': 14,  // Comm Pro 16T $79.99
    'price_1TJevv2RJtQwVGBEHg2I2zIo': 15,  // Comm Pro 32T $159.99
    // Commissioner All-Pro tiers
    'price_1TJevv2RJtQwVGBEzlCf01v2': 20,  // Comm All-Pro 8T $69.99
    'price_1TJevw2RJtQwVGBEFZWHQ2U8': 21,  // Comm All-Pro 10T $89.99
    'price_1TJevx2RJtQwVGBEYS7UwvO7': 22,  // Comm All-Pro 12T $104.99
    'price_1TJevx2RJtQwVGBEQnE3ySf2': 23,  // Comm All-Pro 14T $124.99
    'price_1TJevy2RJtQwVGBERHTlBc8R': 24,  // Comm All-Pro 16T $139.99
    'price_1TJevz2RJtQwVGBEy8BTKIEy': 25,  // Comm All-Pro 32T $239.99
    // Commissioner Elite tiers
    'price_1TJevz2RJtQwVGBE0hnaSc7R': 30,  // Comm Elite 8T $109.99
    'price_1TJew02RJtQwVGBEh7b4ouVh': 31,  // Comm Elite 10T $129.99
    'price_1TJew02RJtQwVGBE0sCYXfTw': 32,  // Comm Elite 12T $149.99
    'price_1TJew12RJtQwVGBEW9pgN0sI': 33,  // Comm Elite 14T $169.99
    'price_1TJew22RJtQwVGBEUzuZWBkD': 34,  // Comm Elite 16T $189.99
    'price_1TJew22RJtQwVGBE0mw4lTfA': 35,  // Comm Elite 32T $299.99
};

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as { priceId?: string };
    const { priceId } = body;

    if (!priceId) {
        return Response.json({ error: 'priceId is required' }, { status: 400 });
    }

    // Validate new price is in our catalog
    const newTier = priceIdToTier(priceId);
    if (!newTier) {
        return Response.json({ error: 'Invalid priceId' }, { status: 400 });
    }

    // Load user's current subscription
    const sub = await prisma.subscription.findUnique({
        where: { userId: session.user.id },
        select: { stripeSubscriptionId: true, status: true },
    });

    if (!sub?.stripeSubscriptionId) {
        return Response.json({ error: 'No active subscription found' }, { status: 404 });
    }
    if (sub.status !== 'active' && sub.status !== 'trialing') {
        return Response.json({ error: 'Subscription is not active' }, { status: 400 });
    }

    // Get current price from Stripe
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const currentPriceId = stripeSub.items.data[0]?.price.id;

    if (!currentPriceId) {
        return Response.json({ error: 'Could not determine current plan' }, { status: 500 });
    }

    // Server-side rank validation — never trust the client
    const currentRank = TIER_RANK[currentPriceId] ?? 0;
    const newRank     = TIER_RANK[priceId] ?? 0;

    if (newRank <= currentRank) {
        return Response.json(
            { error: 'Downgrades are not allowed. Please cancel and resubscribe if you need a different plan.' },
            { status: 400 }
        );
    }

    // Execute the upgrade — charge prorated difference immediately
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{
            id: stripeSub.items.data[0].id,
            price: priceId,
        }],
        proration_behavior: 'always_invoice',
    });

    // Update DB — the webhook will also fire but update eagerly for instant UI
    await prisma.$transaction([
        prisma.user.update({
            where: { id: session.user.id },
            data: { subscriptionTier: newTier },
        }),
        prisma.subscription.update({
            where: { userId: session.user.id },
            data: {
                tier: newTier,
                status: updated.status,
            },
        }),
    ]);

    return Response.json({ success: true, tier: newTier });
}
