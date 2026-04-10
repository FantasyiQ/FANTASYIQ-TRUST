import type { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const memberId  = searchParams.get('memberId');
    const duesId    = searchParams.get('duesId');

    if (!sessionId || !memberId || !duesId) redirect('/dashboard/commissioner/dues');

    const cs = await stripe.checkout.sessions.retrieve(sessionId);
    if (cs.payment_status !== 'paid') redirect(`/dashboard/commissioner/dues/${duesId}?error=payment-failed`);

    const member = await prisma.duesMember.findUnique({
        where: { id: memberId },
        select: { duesStatus: true, leagueDuesId: true },
    });
    if (!member || member.leagueDuesId !== duesId) redirect('/dashboard/commissioner/dues');

    if (member.duesStatus !== 'paid') {
        const dues = await prisma.leagueDues.findUnique({
            where: { id: duesId },
            select: { buyInAmount: true, potTotal: true },
        });
        if (dues) {
            await prisma.$transaction([
                prisma.duesMember.update({
                    where: { id: memberId },
                    data: {
                        duesStatus: 'paid',
                        paidAt: new Date(),
                        paymentMethod: 'stripe_on_behalf',
                        stripePaymentId: cs.id,
                    },
                }),
                prisma.leagueDues.update({
                    where: { id: duesId },
                    data: { potTotal: dues.potTotal + dues.buyInAmount, status: 'active' },
                }),
            ]);
        }
    }

    redirect(`/dashboard/commissioner/dues/${duesId}?paid=1`);
}
