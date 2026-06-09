import type { NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

function appUrl() {
    const u = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!u) throw new Error('NEXTAUTH_URL is not configured');
    return u;
}

// POST /api/stripe/connect/winner-retry
// Body: { claimToken: string }
// Commissioner-only. Re-attempts a failed transfer. If winner's Connect account is active,
// executes the transfer immediately. If not, issues a new onboarding link.
export async function POST(req: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { claimToken?: string };
    const { claimToken } = body;
    if (!claimToken) return Response.json({ error: 'claimToken is required' }, { status: 400 });

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const item = await prisma.payoutProposalItem.findUnique({
        where: { winnerClaimToken: claimToken },
        include: {
            member:     { select: { id: true, stripeConnectAccountId: true, email: true, displayName: true } },
            proposal: {
                include: {
                    leagueDues: { select: { id: true, leagueName: true, commissionerId: true } },
                },
            },
            payoutSpot: { select: { label: true } },
        },
    });

    if (!item) return Response.json({ error: 'Payout item not found' }, { status: 404 });

    // Only the commissioner of this league may trigger a retry
    if (item.proposal.leagueDues.commissionerId !== user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (item.status === 'transfer_initiated' || item.status === 'paid_out') {
        return Response.json({ error: 'Transfer already completed' }, { status: 400 });
    }

    if (item.status !== 'failed' && item.status !== 'claim_sent') {
        return Response.json({ error: `Cannot retry item in status: ${item.status}` }, { status: 400 });
    }

    const base = appUrl();
    const winnerAccountId = item.member.stripeConnectAccountId;

    // If winner has no Connect account yet, or their account isn't active, send a fresh onboarding link
    if (!winnerAccountId) {
        const account = await stripe.accounts.create({
            type:         'express',
            country:      'US',
            email:        item.member.email ?? undefined,
            capabilities: { transfers: { requested: true } },
            metadata:     { memberId: item.member.id, claimToken, proposalItemId: item.id },
        });

        await prisma.duesMember.update({
            where: { id: item.member.id },
            data:  { stripeConnectAccountId: account.id },
        });

        const link = await stripe.accountLinks.create({
            account:     account.id,
            refresh_url: `${base}/claim-winnings/${claimToken}?refresh=1`,
            return_url:  `${base}/api/stripe/connect/winner-callback?claimToken=${claimToken}`,
            type:        'account_onboarding',
        });

        await prisma.payoutProposalItem.update({
            where: { id: item.id },
            data:  { status: 'claim_sent', failedReason: null, claimSentAt: new Date() },
        });

        return Response.json({ action: 'onboard', url: link.url });
    }

    // Account exists — check if it's active
    const account = await stripe.accounts.retrieve(winnerAccountId);
    if (!account.charges_enabled) {
        // Re-issue a fresh onboarding link for their existing account
        const link = await stripe.accountLinks.create({
            account:     winnerAccountId,
            refresh_url: `${base}/claim-winnings/${claimToken}?refresh=1`,
            return_url:  `${base}/api/stripe/connect/winner-callback?claimToken=${claimToken}`,
            type:        'account_onboarding',
        });

        await prisma.payoutProposalItem.update({
            where: { id: item.id },
            data:  { status: 'claim_sent', failedReason: null, claimSentAt: new Date() },
        });

        return Response.json({ action: 'onboard', url: link.url });
    }

    // Account is active — pre-check balance and retry the transfer now
    const stripeBalance  = await stripe.balance.retrieve();
    const availableCents = stripeBalance.available.find(b => b.currency === 'usd')?.amount ?? 0;
    const neededCents    = Math.round(item.amount * 100);

    if (availableCents < neededCents) {
        return Response.json({
            error: `Stripe platform balance ($${(availableCents / 100).toFixed(2)}) is insufficient for this payout ($${item.amount.toFixed(2)}).`,
        }, { status: 400 });
    }

    try {
        const transfer = await stripe.transfers.create({
            amount:      neededCents,
            currency:    'usd',
            destination: winnerAccountId,
            description: `${item.payoutSpot.label} payout — ${item.proposal.leagueDues.leagueName}`,
            metadata:    { proposalItemId: item.id, claimToken, duesId: item.proposal.leagueDues.id, retry: 'true' },
        });

        await prisma.payoutProposalItem.update({
            where: { id: item.id },
            data: {
                status:           'paid_out',
                stripeTransferId: transfer.id,
                claimedAt:        new Date(),
                failedReason:     null,
            },
        });

        return Response.json({ action: 'transferred', transferId: transfer.id });
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error('[winner-retry] transfer failed again', err);

        await prisma.payoutProposalItem.update({
            where: { id: item.id },
            data:  { status: 'failed', failedReason: reason },
        });

        return Response.json({ error: `Transfer failed: ${reason}` }, { status: 500 });
    }
}
