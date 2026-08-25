import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

function appUrl() {
    const u = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!u) throw new Error('NEXTAUTH_URL is not configured');
    return u;
}

// POST /api/stripe/connect/commissioner-onboard
// Body: { returnPath?: string } — where to send the commissioner after onboarding
// (defaults to the dues setup page). Creates a Stripe Express account for the
// commissioner (if they don't already have one) and returns an onboarding link.
// Dues checkout sessions route directly into this account going forward —
// the commissioner holds true custody of their own league funds, not FiQ.
export async function POST(req: NextRequest): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(req));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as { returnPath?: string };
    const returnPath = body.returnPath && body.returnPath.startsWith('/')
        ? body.returnPath
        : '/dashboard/commissioner/dues/setup';

    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { id: true, email: true, stripeConnectAccountId: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    let accountId = user.stripeConnectAccountId;

    if (!accountId) {
        // Commissioner accounts receive destination charges directly (dues
        // payments), unlike winner accounts which only ever receive a
        // platform-initiated transfer — card_payments is required for that.
        const account = await stripe.accounts.create({
            type:    'express',
            country: 'US',
            email:   user.email,
            capabilities: {
                card_payments: { requested: true },
                transfers:     { requested: true },
            },
            metadata: { userId: user.id, role: 'commissioner' },
        });
        accountId = account.id;

        await prisma.user.update({
            where: { id: user.id },
            data:  { stripeConnectAccountId: accountId },
        });
    }

    const base = appUrl();
    const link = await stripe.accountLinks.create({
        account:     accountId,
        refresh_url: `${base}${returnPath}?stripeConnect=refresh`,
        return_url:  `${base}${returnPath}?stripeConnect=return`,
        type:        'account_onboarding',
    });

    return Response.json({ url: link.url });
}
