import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

function appUrl(): string {
    return process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { memberId?: string; duesId?: string };
    const { memberId, duesId } = body;
    if (!memberId || !duesId) return Response.json({ error: 'memberId and duesId are required.' }, { status: 400 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true, name: true, stripeCustomerId: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true, leagueName: true, buyInAmount: true },
    });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const member = await prisma.duesMember.findUnique({
        where: { id: memberId },
        select: { duesStatus: true, leagueDuesId: true, displayName: true },
    });
    if (!member || member.leagueDuesId !== duesId) return Response.json({ error: 'Member not found.' }, { status: 404 });
    if (member.duesStatus === 'paid') return Response.json({ error: 'Member has already paid.' }, { status: 400 });

    // Get or create Stripe customer for commissioner
    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email ?? undefined,
            name: user.name ?? undefined,
            metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    // Amount in cents
    const amountCents = Math.round(dues.buyInAmount * 100);

    const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: amountCents,
                product_data: {
                    name: `League Dues — ${dues.leagueName}`,
                    description: `Paid on behalf of ${member.displayName}`,
                },
            },
        }],
        success_url: `${appUrl()}/api/dues/members/pay-confirm?session_id={CHECKOUT_SESSION_ID}&memberId=${memberId}&duesId=${duesId}`,
        cancel_url: `${appUrl()}/dashboard/commissioner/dues/${duesId}`,
        metadata: {
            type: 'league_dues_on_behalf',
            memberId,
            duesId,
            commissionerId: user.id,
        },
    });

    return Response.json({ url: checkoutSession.url });
}
