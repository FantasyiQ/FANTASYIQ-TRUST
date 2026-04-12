import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

function appUrl() {
    return process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true, name: true, stripeCustomerId: true },
    });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const { id } = await request.json() as { id?: string };
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const obligation = await prisma.futureDuesObligation.findUnique({
        where: { id },
        include: {
            leagueDues: { select: { commissionerId: true, leagueName: true, id: true } },
            member:     { select: { displayName: true } },
        },
    });
    if (!obligation || obligation.leagueDues.commissionerId !== user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (obligation.status === 'paid') {
        return Response.json({ error: 'Already paid' }, { status: 400 });
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email ?? undefined,
            name:  user.name  ?? undefined,
            metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const amountCents = Math.round(obligation.amount * 100);
    const duesId = obligation.leagueDues.id;

    const cs = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: amountCents,
                product_data: {
                    name: `${obligation.season} Future League Dues — ${obligation.leagueDues.leagueName}`,
                    description: `Paid on behalf of ${obligation.member.displayName}`,
                },
            },
        }],
        success_url: `${appUrl()}/api/dues/future-dues/pay-confirm?session_id={CHECKOUT_SESSION_ID}&obligationId=${id}&duesId=${duesId}`,
        cancel_url:  `${appUrl()}/dashboard/commissioner/dues/${duesId}/future-dues`,
        metadata: {
            type:          'future_dues_on_behalf',
            obligationId:  id,
            duesId,
            commissionerId: user.id,
        },
    });

    return Response.json({ url: cs.url });
}
