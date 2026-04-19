import type { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

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
        const cs = await stripe.checkout.sessions.retrieve(sessionId);
        if (cs.payment_status === 'paid') {
            const member = await prisma.duesMember.findUnique({
                where: { id: memberId },
                select: { duesStatus: true, leagueDuesId: true },
            });

            // Idempotent: only write if not already paid (webhook may have been first)
            if (member && member.leagueDuesId === duesId && member.duesStatus !== 'paid') {
                const dues = await prisma.leagueDues.findUnique({
                    where: { id: duesId },
                    select: { buyInAmount: true },
                });
                if (dues) {
                    await prisma.$transaction([
                        prisma.duesMember.update({
                            where: { id: memberId },
                            data: {
                                duesStatus:     'paid',
                                paidAt:         new Date(),
                                paymentMethod:  'stripe_direct',
                                stripePaymentId: typeof cs.payment_intent === 'string' ? cs.payment_intent : null,
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
                }
            }
        }
    } catch { /* non-fatal — member stays pending, can retry */ }

    redirect(`${fallback}?dues_paid=true`);
}
