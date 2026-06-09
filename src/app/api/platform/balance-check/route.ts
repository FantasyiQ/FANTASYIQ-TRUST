import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { auth } from '@/lib/auth';

const BUFFER_USD = 500;

// Returns platform balance vs outstanding payouts. Restricted to admins and
// commissioners (who see the warning in the proposal approval UI).
export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { isAdmin: true, subscriptions: { where: { type: 'commissioner', status: { in: ['active', 'trialing'] } }, select: { id: true } } },
    });

    const isCommissioner = (user?.subscriptions.length ?? 0) > 0;
    if (!user?.isAdmin && !isCommissioner) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [balance, outstanding] = await Promise.all([
        stripe.balance.retrieve(),
        prisma.payoutProposalItem.aggregate({
            where: { status: 'claim_sent' },
            _sum:  { amount: true },
        }),
    ]);

    const availableUsd   = (balance.available.find(b => b.currency === 'usd')?.amount ?? 0) / 100;
    const outstandingUsd = outstanding._sum.amount ?? 0;
    const bufferUsd      = availableUsd - outstandingUsd;

    return Response.json({
        availableUsd,
        outstandingUsd,
        bufferUsd,
        isLow:      bufferUsd < BUFFER_USD,
        isCritical: bufferUsd < 0,
    });
}
