import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import { captureError } from '@/lib/sentry';

export const maxDuration = 60;

// Threshold: alert when platform Stripe balance minus all outstanding claim_sent
// commitments drops below this buffer (in dollars).
const BUFFER_USD = 500;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [balance, outstanding] = await Promise.all([
            stripe.balance.retrieve(),
            prisma.payoutProposalItem.aggregate({
                where: { status: 'claim_sent' },
                _sum:  { amount: true },
            }),
        ]);

        const availableUsd    = (balance.available.find(b => b.currency === 'usd')?.amount ?? 0) / 100;
        const outstandingUsd  = outstanding._sum.amount ?? 0;
        const bufferUsd       = availableUsd - outstandingUsd;
        const isCritical      = bufferUsd < 0;
        const isLow           = bufferUsd < BUFFER_USD;

        if (!isLow) {
            return Response.json({ ok: true, availableUsd, outstandingUsd, bufferUsd });
        }

        const admins = await prisma.user.findMany({
            where:  { isAdmin: true },
            select: { id: true },
        });

        if (admins.length === 0) {
            return Response.json({ ok: true, warned: 0, availableUsd, outstandingUsd, bufferUsd });
        }

        const title = isCritical
            ? 'CRITICAL: Platform balance below outstanding payouts'
            : 'Platform balance low — add funds soon';

        const body = isCritical
            ? `Platform Stripe balance is $${availableUsd.toFixed(2)} but outstanding payout commitments total $${outstandingUsd.toFixed(2)}. Transfers will fail without additional funds.`
            : `Platform Stripe balance is $${availableUsd.toFixed(2)} with $${outstandingUsd.toFixed(2)} in pending payouts — only $${bufferUsd.toFixed(2)} buffer remaining (threshold: $${BUFFER_USD}).`;

        await Promise.allSettled(
            admins.map(admin =>
                notify({
                    userId:     admin.id,
                    type:       NotificationType.PLATFORM_BALANCE_LOW,
                    title,
                    body,
                    inApp:      true,
                    email:      true,
                    throttleMs: 24 * 60 * 60 * 1000,
                    data:       { availableUsd, outstandingUsd, bufferUsd },
                }).catch(err => captureError(err, { context: 'platform-balance-alert notify', userId: admin.id })),
            ),
        );

        return Response.json({ ok: true, warned: admins.length, availableUsd, outstandingUsd, bufferUsd, isCritical });
    } catch (err) {
        captureError(err instanceof Error ? err : new Error(String(err)), { context: 'platform-balance-alert cron' });
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
