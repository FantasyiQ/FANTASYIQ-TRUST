import type { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

export async function GET(request: NextRequest): Promise<never> {
    const { searchParams } = request.nextUrl;
    const sessionId    = searchParams.get('session_id');
    const obligationId = searchParams.get('obligationId');
    const duesId       = searchParams.get('duesId');

    if (!sessionId || !obligationId || !duesId) {
        redirect('/dashboard/commissioner/dues');
    }

    try {
        const cs = await stripe.checkout.sessions.retrieve(sessionId);
        if (cs.payment_status === 'paid') {
            const obligation = await prisma.futureDuesObligation.findUnique({
                where: { id: obligationId },
                select: {
                    status: true,
                    season: true,
                    amount: true,
                    leagueDues: { select: { commissionerId: true, leagueName: true } },
                },
            });

            if (obligation && obligation.status !== 'paid') {
                await prisma.futureDuesObligation.update({
                    where: { id: obligationId },
                    data: { status: 'paid', paidAt: new Date(), paymentMethod: 'stripe_on_behalf' },
                });

                // Credit the future season's tracker pot if it exists
                const futureTracker = await prisma.leagueDues.findFirst({
                    where: {
                        commissionerId: obligation.leagueDues.commissionerId,
                        leagueName:     obligation.leagueDues.leagueName,
                        season:         obligation.season,
                    },
                    select: { id: true, potTotal: true },
                });
                if (futureTracker) {
                    await prisma.leagueDues.update({
                        where: { id: futureTracker.id },
                        data: { potTotal: futureTracker.potTotal + obligation.amount, status: 'active' },
                    });
                }
            } else if (obligation === null) {
                // Fallback: just mark paid without pot credit
                await prisma.futureDuesObligation.update({
                    where: { id: obligationId },
                    data: { status: 'paid', paidAt: new Date(), paymentMethod: 'stripe_on_behalf' },
                });
            }
        }
    } catch { /* non-fatal — obligation stays pending */ }

    redirect(`/dashboard/commissioner/dues/${duesId}/future-dues`);
}
