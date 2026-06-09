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

    // Block deletion if any winner has an unclaimed payout — cascade delete would
    // orphan the money in FiQ's Stripe balance with no DB record to pay it out from.
    const activeClaims = await prisma.payoutProposalItem.count({
        where: {
            status:   'claim_sent',
            proposal: { leagueDues: { commissionerId: userId } },
        },
    });
    if (activeClaims > 0) {
        return Response.json(
            { error: `You have ${activeClaims} pending winner payout${activeClaims === 1 ? '' : 's'} that must be resolved before deleting your account. Visit your proposal pages to cancel or reissue them.` },
            { status: 409 },
        );
    }

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
