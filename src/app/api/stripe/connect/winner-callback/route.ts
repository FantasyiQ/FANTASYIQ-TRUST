import type { NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

// GET /api/stripe/connect/winner-callback?claimToken=xxx
// Stripe redirects here after winner completes Express onboarding.
// Verifies their account, then transfers from FiQ's platform balance → winner's connected account.
export async function GET(req: NextRequest): Promise<Response> {
    const { searchParams } = new URL(req.url);
    const claimToken = searchParams.get('claimToken');

    if (!claimToken) redirect('/');

    const item = await prisma.payoutProposalItem.findUnique({
        where:   { winnerClaimToken: claimToken },
        include: {
            member:     { select: { id: true, stripeConnectAccountId: true } },
            proposal:   { include: { leagueDues: { select: { id: true, leagueName: true } } } },
            payoutSpot: { select: { label: true } },
        },
    });

    if (!item) redirect('/');

    if (item.status === 'transfer_initiated' || item.status === 'paid_out') {
        redirect(`/claim-winnings/${claimToken}?status=already_paid`);
    }

    const winnerAccountId = item.member.stripeConnectAccountId;
    if (!winnerAccountId) redirect(`/claim-winnings/${claimToken}?status=error`);

    // Verify winner's Express account is active
    const winnerAccount = await stripe.accounts.retrieve(winnerAccountId);
    if (!winnerAccount.charges_enabled) {
        redirect(`/claim-winnings/${claimToken}?status=pending`);
    }

    // Pre-transfer balance check: ensure platform has sufficient funds
    const stripeBalance   = await stripe.balance.retrieve();
    const availableCents  = stripeBalance.available.find(b => b.currency === 'usd')?.amount ?? 0;
    const neededCents     = Math.round(item.amount * 100);
    if (availableCents < neededCents) {
        console.error('[winner-callback] insufficient Stripe balance', { available: availableCents, needed: neededCents });
        redirect(`/claim-winnings/${claimToken}?status=error`);
    }

    try {
        // Transfer from FiQ's platform balance → winner's connected account.
        // No stripeAccount header = debit from FiQ's platform, not a commissioner's account.
        const transfer = await stripe.transfers.create({
            amount:      Math.round(item.amount * 100),
            currency:    'usd',
            destination: winnerAccountId,
            description: `${item.payoutSpot.label} payout — ${item.proposal.leagueDues.leagueName}`,
            metadata:    { proposalItemId: item.id, claimToken, duesId: item.proposal.leagueDues.id },
        });

        await prisma.payoutProposalItem.update({
            where: { id: item.id },
            data: {
                status:           'transfer_initiated',
                stripeTransferId: transfer.id,
                claimedAt:        new Date(),
            },
        });

        redirect(`/claim-winnings/${claimToken}?status=success`);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error('[winner-callback] transfer failed', err);

        await prisma.payoutProposalItem.update({
            where: { id: item.id },
            data:  { status: 'failed', failedReason: reason },
        }).catch(dbErr => console.error('[winner-callback] failed to persist failure status', dbErr));

        redirect(`/claim-winnings/${claimToken}?status=error`);
    }
}
