import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

function appUrl(): string {
    return process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

export async function POST(_request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
        return Response.json({ error: 'No Stripe customer found' }, { status: 404 });
    }

    try {
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${appUrl()}/dashboard`,
        });
        return Response.json({ url: portalSession.url });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create portal session';
        return Response.json({ error: message }, { status: 500 });
    }
}
