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
            await prisma.futureDuesObligation.update({
                where: { id: obligationId },
                data: {
                    status:        'paid',
                    paidAt:        new Date(),
                    paymentMethod: 'stripe_on_behalf',
                },
            });
        }
    } catch { /* non-fatal — obligation stays pending */ }

    redirect(`/dashboard/commissioner/dues/${duesId}/future-dues`);
}
