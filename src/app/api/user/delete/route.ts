import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

// DELETE /api/user/delete — GDPR right to erasure
// Cancels active Stripe subscriptions, then deletes the user record.
// Cascading deletes on User handle: leagues, dues, notifications, subscriptions, etc.
export async function DELETE(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch the Stripe customer ID and any active subscriptions before deletion
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: {
            stripeCustomerId: true,
            subscriptions: {
                where:  { status: { in: ['active', 'trialing'] } },
                select: { stripeSubscriptionId: true },
            },
        },
    });

    // Cancel all active Stripe subscriptions (best-effort — don't block deletion on failure)
    if (user?.stripeCustomerId && user.subscriptions.length > 0) {
        await Promise.allSettled(
            user.subscriptions
                .filter(s => s.stripeSubscriptionId)
                .map(s =>
                    stripe.subscriptions.cancel(s.stripeSubscriptionId!, {
                        prorate: false,
                    })
                )
        );
    }

    // Delete the user — all related data cascades via DB foreign keys
    await prisma.user.delete({ where: { id: userId } });

    return Response.json({ deleted: true });
}
