import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

const MAX_ITEMS_PER_RUN = 20;

// GET /api/cron/payout-retry
// Finds stuck claim_sent / failed payout items where the winner already has a
// Connect account, checks whether each account is now active, and attempts the
// transfer for any that are ready. Runs hourly via Vercel cron.
export async function GET(request: NextRequest): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stuckItems = await prisma.payoutProposalItem.findMany({
        where: {
            status: { in: ['failed', 'claim_sent'] },
            member: { stripeConnectAccountId: { not: null } },
        },
        take:    MAX_ITEMS_PER_RUN,
        orderBy: { claimSentAt: 'asc' },
        include: {
            member:     { select: { id: true, displayName: true, stripeConnectAccountId: true } },
            proposal:   { include: { leagueDues: { select: { id: true, leagueName: true, commissionerId: true } } } },
            payoutSpot: { select: { label: true } },
        },
    });

    if (stuckItems.length === 0) {
        return Response.json({ ok: true, processed: 0, skipped: 0 });
    }

    // Retrieve Stripe balance once — deduct as we go to avoid over-committing
    const bal      = await stripe.balance.retrieve();
    let available  = bal.available.find(b => b.currency === 'usd')?.amount ?? 0;

    // Batch stripe.accounts.retrieve() — one call per unique account ID
    const uniqueAccountIds = [...new Set(stuckItems.map(i => i.member.stripeConnectAccountId!))];
    const accountMap = new Map<string, Stripe.Account>();
    for (const accountId of uniqueAccountIds) {
        try {
            accountMap.set(accountId, await stripe.accounts.retrieve(accountId));
        } catch (err) {
            captureError(err, { context: 'payout-retry cron accounts.retrieve', accountId });
        }
    }

    let processed = 0;
    let skipped   = 0;

    for (const item of stuckItems) {
        const accountId = item.member.stripeConnectAccountId!;
        const account   = accountMap.get(accountId);

        if (!account?.charges_enabled || !account?.payouts_enabled) {
            skipped++;
            continue;
        }

        const { leagueName, commissionerId } = item.proposal.leagueDues;
        const winnerName = item.member.displayName ?? 'Winner';
        const needed     = Math.round(item.amount * 100);

        if (available < needed) {
            await notify({
                userId:     commissionerId,
                type:       NotificationType.PAYOUT_FAILED,
                title:      'Payout balance insufficient',
                body:       `${winnerName}'s payout for ${leagueName} ($${item.amount.toFixed(2)}) could not be sent: FiQ's platform balance is too low. Contact support.`,
                inApp:      true,
                email:      true,
                throttleMs: 0,
                data:       { itemId: item.id, leagueName, winnerName },
            }).catch(err => captureError(err, { context: 'payout-retry balance insufficient', itemId: item.id }));
            skipped++;
            continue;
        }

        try {
            const transfer = await stripe.transfers.create({
                amount:      needed,
                currency:    'usd',
                destination: accountId,
                description: `${item.payoutSpot.label} payout — ${leagueName}`,
                metadata:    { proposalItemId: item.id, duesId: item.proposal.leagueDues.id, autoRetry: 'true' },
            }, { idempotencyKey: `${item.id}-auto-retry` });

            available -= needed;

            await prisma.payoutProposalItem.update({
                where: { id: item.id },
                data: {
                    status:           'paid_out',
                    stripeTransferId: transfer.id,
                    claimedAt:        new Date(),
                    failedReason:     null,
                },
            });

            await notify({
                userId:     commissionerId,
                type:       NotificationType.PAYOUTS_RELEASED,
                title:      'Payout sent',
                body:       `${winnerName}'s $${item.amount.toFixed(2)} ${item.payoutSpot.label} payout for ${leagueName} has been sent to their bank.`,
                inApp:      true,
                email:      false,
                throttleMs: 0,
                data:       { itemId: item.id, leagueName, winnerName, transferId: transfer.id },
            }).catch(err => captureError(err, { context: 'payout-retry success notify', itemId: item.id }));

            processed++;
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            captureError(err, { context: 'payout-retry transfer', itemId: item.id });

            await prisma.payoutProposalItem.update({
                where: { id: item.id },
                data:  { status: 'failed', failedReason: reason },
            }).catch(dbErr => captureError(dbErr, { context: 'payout-retry db write', itemId: item.id }));

            await notify({
                userId:     commissionerId,
                type:       NotificationType.PAYOUT_FAILED,
                title:      'Automatic payout retry failed',
                body:       `The automatic retry for ${winnerName}'s payout in ${leagueName} failed: ${reason}. Please retry manually from the proposal page.`,
                inApp:      true,
                email:      true,
                throttleMs: 0,
                data:       { itemId: item.id, leagueName, winnerName },
            }).catch(notifyErr => captureError(notifyErr, { context: 'payout-retry fail notify', itemId: item.id }));

            skipped++;
        }
    }

    return Response.json({ ok: true, processed, skipped });
}
