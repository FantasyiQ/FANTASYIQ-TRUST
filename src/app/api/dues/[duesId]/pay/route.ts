import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

function appUrl() {
    return process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

// POST /api/dues/[duesId]/pay
// Creates a Stripe Checkout session for the authenticated member's buy-in.
// Commissioners must use "Record Cash Received" instead.
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true, name: true, stripeCustomerId: true },
    });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { id: true, leagueName: true, season: true, buyInAmount: true, commissionerId: true },
    });
    if (!dues) return Response.json({ error: 'Dues not found' }, { status: 404 });

    // Commissioners use "Record Cash Received" — block this flow for them
    if (dues.commissionerId === user.id) {
        return Response.json({ error: 'Commissioners use Record Cash Received.' }, { status: 403 });
    }

    // Find the DuesMember row linked to this user
    const member = await prisma.duesMember.findFirst({
        where: { leagueDuesId: duesId, userId: user.id },
        select: { id: true, duesStatus: true, displayName: true },
    });
    if (!member) return Response.json({ error: 'Member record not found for your account.' }, { status: 403 });
    if (member.duesStatus === 'paid') return Response.json({ error: 'Already paid.' }, { status: 400 });

    // Find this user's League record to build success/cancel URLs
    const userLeague = await prisma.league.findFirst({
        where: {
            userId: user.id,
            leagueName: { equals: dues.leagueName, mode: 'insensitive' },
            season: dues.season,
        },
        select: { id: true },
    });

    // Get or create Stripe customer
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

    const base = appUrl();
    const leagueDbId = userLeague?.id;
    const amountCents = Math.round(dues.buyInAmount * 100);

    const cs = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: amountCents,
                product_data: {
                    name: `League Dues — ${dues.leagueName}`,
                    description: `${dues.season} season buy-in · ${member.displayName}`,
                },
            },
        }],
        success_url: leagueDbId
            ? `${base}/api/dues/${duesId}/pay-confirm?session_id={CHECKOUT_SESSION_ID}&memberId=${member.id}&leagueId=${leagueDbId}`
            : `${base}/dashboard?dues_paid=true`,
        cancel_url: leagueDbId
            ? `${base}/dashboard/league/${leagueDbId}?dues_cancelled=true`
            : `${base}/dashboard`,
        metadata: {
            type:        'LEAGUE_DUES',
            duesId,
            memberId:    member.id,
            buyInAmount: String(dues.buyInAmount),
        },
    });

    return Response.json({ url: cs.url });
}
