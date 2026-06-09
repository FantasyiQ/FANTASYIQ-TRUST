import type { NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

function appUrl() {
    const u = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!u) throw new Error('NEXTAUTH_URL is not configured');
    return u;
}

// POST /api/stripe/connect/winner-onboard
// Body: { claimToken }
// Creates a Stripe Express account for the winner and returns an onboarding link.
// Called from the /claim-winnings/[token] page.
export async function POST(req: NextRequest): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(req));
    if (rl.limited) return rl.response!;

    const { claimToken } = await req.json() as { claimToken?: string };
    if (!claimToken) return Response.json({ error: 'Missing claimToken' }, { status: 400 });

    const item = await prisma.payoutProposalItem.findUnique({
        where:   { winnerClaimToken: claimToken },
        include: {
            member:     { select: { id: true, userId: true, email: true, stripeConnectAccountId: true } },
            payoutSpot: { select: { label: true } },
            proposal:   { include: { leagueDues: { select: { leagueName: true } } } },
        },
    });

    if (!item) return Response.json({ error: 'Invalid or expired claim link.' }, { status: 404 });
    if (item.status === 'transfer_initiated' || item.status === 'paid_out') {
        return Response.json({ error: 'This payout has already been processed.' }, { status: 400 });
    }

    // If winner already has a Connect account, send them to the callback to trigger transfer
    if (item.member.stripeConnectAccountId) {
        return Response.json({ alreadyOnboarded: true });
    }

    // Resolve winner email
    let winnerEmail: string | undefined;
    if (item.member.userId) {
        const fiqUser = await prisma.user.findUnique({
            where:  { id: item.member.userId },
            select: { email: true },
        });
        winnerEmail = fiqUser?.email ?? undefined;
    }
    winnerEmail = winnerEmail ?? item.member.email ?? undefined;

    // Create winner's Express account (for receiving payouts only)
    const account = await stripe.accounts.create({
        type:    'express',
        country: 'US',
        email:   winnerEmail,
        capabilities: { transfers: { requested: true } },
        metadata: { memberId: item.member.id, proposalItemId: item.id },
    });

    await prisma.duesMember.update({
        where: { id: item.member.id },
        data:  { stripeConnectAccountId: account.id },
    });

    const base = appUrl();
    const link = await stripe.accountLinks.create({
        account:     account.id,
        refresh_url: `${base}/claim-winnings/${claimToken}?refresh=1`,
        return_url:  `${base}/api/stripe/connect/winner-callback?claimToken=${claimToken}`,
        type:        'account_onboarding',
    });

    return Response.json({ url: link.url });
}
