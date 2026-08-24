import { prisma } from '@/lib/prisma';

// The platform-wide Stripe balance check alone can't tell one league's real
// Stripe money apart from another league's — or from cash/Venmo dues that
// were only ever logged in FiQ's ledger (collectedAmount) and never actually
// touched Stripe. Without this, a payout for League A could silently be
// funded by League B's dues, or by FiQ's own subscription revenue, as long
// as the platform's overall balance happened to cover it.
//
// This computes what's actually safe to transfer for a given league: dues
// collected through real Stripe payments only (paymentMethod stripe_direct /
// stripe_on_behalf — never 'manual'), minus whatever's already been
// transferred out via Stripe for that same league.
export async function getStripeAvailableForLeaguePayout(leagueDuesId: string): Promise<number> {
    const [dues, stripePaidCount, alreadyTransferred] = await Promise.all([
        prisma.leagueDues.findUnique({
            where:  { id: leagueDuesId },
            select: { buyInAmount: true },
        }),
        prisma.duesMember.count({
            where: {
                leagueDuesId,
                duesStatus:    'paid',
                paymentMethod: { in: ['stripe_direct', 'stripe_on_behalf'] },
            },
        }),
        prisma.payoutProposalItem.aggregate({
            where: {
                proposal: { leagueDuesId },
                status:   { in: ['transfer_initiated', 'paid_out'] },
            },
            _sum: { amount: true },
        }),
    ]);

    if (!dues) return 0;

    const stripeCollected = stripePaidCount * dues.buyInAmount;
    const alreadyPaidOut  = alreadyTransferred._sum.amount ?? 0;
    return Math.max(0, stripeCollected - alreadyPaidOut);
}
