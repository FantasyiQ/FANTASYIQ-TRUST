import type { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';

// GET /api/dues/[duesId]/pay-confirm
// Belt-and-suspenders fulfillment after Stripe Checkout. The webhook handles
// the same update idempotently — whichever fires first wins, the second is a no-op.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<never> {
    const { duesId } = await params;
    const { searchParams } = request.nextUrl;
    const sessionId = searchParams.get('session_id');
    const memberId  = searchParams.get('memberId');
    const leagueId  = searchParams.get('leagueId');

    const fallback = leagueId ? `/dashboard/league/${leagueId}` : '/dashboard';

    if (!sessionId || !memberId) redirect(fallback);

    try {
        const cs = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent.latest_charge'],
        });
        if (cs.payment_status === 'paid') {
            // Validate the session was created for this exact member/dues combination.
            // Prevents an attacker from reusing their own paid session_id to mark a
            // different member as paid (IDOR). Metadata is set server-side at checkout
            // creation and cannot be tampered with by the client.
            if (cs.metadata?.memberId !== memberId || cs.metadata?.duesId !== duesId) {
                redirect(fallback);
            }

            const member = await prisma.duesMember.findUnique({
                where: { id: memberId },
                select: { duesStatus: true, leagueDuesId: true, userId: true, displayName: true },
            });

            // Pull receipt URL from the expanded charge
            let receiptUrl: string | null = null;
            try {
                const pi = cs.payment_intent as import('stripe').Stripe.PaymentIntent & {
                    latest_charge?: import('stripe').Stripe.Charge | null;
                } | null;
                receiptUrl = pi?.latest_charge?.receipt_url ?? null;
            } catch { /* non-fatal */ }

            // Idempotent: only write if not already paid (webhook may have been first)
            if (member && member.leagueDuesId === duesId && member.duesStatus !== 'paid') {
                const dues = await prisma.leagueDues.findUnique({
                    where: { id: duesId },
                    select: { buyInAmount: true, leagueName: true, commissionerId: true },
                });
                if (dues) {
                    await prisma.$transaction([
                        prisma.duesMember.update({
                            where: { id: memberId },
                            data: {
                                duesStatus:      'paid',
                                paidAt:          new Date(),
                                paymentMethod:   'stripe_direct',
                                stripePaymentId: typeof cs.payment_intent === 'string' ? cs.payment_intent : null,
                                stripeReceiptUrl: receiptUrl,
                            },
                        }),
                        prisma.leagueDues.update({
                            where: { id: duesId },
                            data: {
                                collectedAmount: { increment: dues.buyInAmount },
                                potTotal:        { increment: dues.buyInAmount },
                            },
                        }),
                    ]);

                    // Notify member (if they have a userId)
                    if (member.userId) {
                        notify({
                            userId: member.userId,
                            type:   NotificationType.DUES_PAYMENT_CONFIRMED,
                            title:  `Payment confirmed — ${dues.leagueName}`,
                            body:   `Your dues payment of $${dues.buyInAmount} for ${dues.leagueName} has been confirmed.`,
                            data: {
                                leagueId:   duesId,
                                leagueName: dues.leagueName,
                                duesId,
                                amount:     dues.buyInAmount,
                            },
                        }).catch(err => console.error('[pay-confirm] notify member failed', err));
                    }

                    // Notify commissioner
                    notify({
                        userId: dues.commissionerId,
                        type:   NotificationType.DUES_PAYMENT_CONFIRMED,
                        title:  `Payment received — ${dues.leagueName}`,
                        body:   `${member.displayName} has paid their dues of $${dues.buyInAmount} for ${dues.leagueName}.`,
                        data: {
                            leagueId:   duesId,
                            leagueName: dues.leagueName,
                            duesId,
                            amount:     dues.buyInAmount,
                            payer:      member.displayName,
                        },
                    }).catch(err => console.error('[pay-confirm] notify commissioner failed', err));
                }
            } else if (member?.duesStatus === 'paid' && receiptUrl) {
                // Already paid (webhook was first) — still save receipt URL if missing
                await prisma.duesMember.updateMany({
                    where: { id: memberId, stripeReceiptUrl: null },
                    data:  { stripeReceiptUrl: receiptUrl },
                });
            }
        }
    } catch { /* non-fatal — member stays pending, can retry */ }

    redirect(`${fallback}?dues_paid=true`);
}
