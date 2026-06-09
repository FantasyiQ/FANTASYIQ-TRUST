import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

// Expires claim_sent payout items whose claim link was sent > 90 days ago.
// Marks them failed, invalidates the token, and notifies the commissioner.
export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        const expiredItems = await prisma.payoutProposalItem.findMany({
            where: {
                status:      'claim_sent',
                claimSentAt: { not: null, lt: ninetyDaysAgo },
            },
            include: {
                proposal: {
                    include: {
                        leagueDues: { select: { id: true, leagueName: true, commissionerId: true } },
                    },
                },
                member:     { select: { displayName: true, email: true } },
                payoutSpot: { select: { label: true } },
            },
        });

        let expired = 0;

        for (const item of expiredItems) {
            const { leagueName, commissionerId } = item.proposal.leagueDues;
            const winnerName = item.member.displayName ?? item.member.email ?? 'A winner';

            await prisma.payoutProposalItem.update({
                where: { id: item.id },
                data: {
                    status:          'failed',
                    failedReason:    'Claim window expired (90 days)',
                    winnerClaimToken: null,
                },
            }).catch(err => captureError(err, { context: 'payout-claim-expiry update', itemId: item.id }));

            await notify({
                userId:     commissionerId,
                type:       NotificationType.PAYOUT_FAILED,
                title:      'Payout claim expired',
                body:       `${winnerName}'s ${item.payoutSpot.label} payout of $${item.amount.toFixed(2)} for ${leagueName} was never claimed and has expired after 90 days. Contact your winner to reissue the claim link from the proposal page.`,
                inApp:      true,
                email:      true,
                throttleMs: 0,
                data:       { itemId: item.id, leagueName, winnerName, amount: item.amount },
            }).catch(err => captureError(err, { context: 'payout-claim-expiry notify', itemId: item.id }));

            expired++;
        }

        return Response.json({ expired });
    } catch (err) {
        captureError(err instanceof Error ? err : new Error(String(err)), { context: 'payout-claim-expiry cron' });
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
