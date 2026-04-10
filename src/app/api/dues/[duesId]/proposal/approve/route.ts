import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

function appUrl() {
    return process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ duesId: string }> }): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, stripeCustomerId: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true, leagueName: true },
    });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { proposalId?: string; assignments?: Record<string, string> };
    const { proposalId, assignments } = body;
    if (!proposalId || !assignments) return Response.json({ error: 'proposalId and assignments are required.' }, { status: 400 });

    const proposal = await prisma.payoutProposal.findUnique({
        where: { id: proposalId },
        include: { items: { include: { payoutSpot: true } } },
    });
    if (!proposal || proposal.leagueDuesId !== duesId) return Response.json({ error: 'Proposal not found.' }, { status: 404 });
    if (proposal.status !== 'pending_commissioner') return Response.json({ error: 'Proposal is not pending approval.' }, { status: 400 });

    // Update item member assignments
    for (const [itemId, memberId] of Object.entries(assignments)) {
        await prisma.payoutProposalItem.update({
            where: { id: itemId },
            data: { memberId },
        });
    }

    // Create Stripe payment links for each winner
    for (const item of proposal.items) {
        const memberId = assignments[item.id];
        if (!memberId) continue;

        const member = await prisma.duesMember.findUnique({
            where: { id: memberId },
            select: { email: true, displayName: true },
        });

        try {
            const paymentLink = await stripe.paymentLinks.create({
                line_items: [{
                    quantity: 1,
                    price_data: {
                        currency: 'usd',
                        unit_amount: Math.round(item.amount * 100),
                        product_data: {
                            name: `${item.payoutSpot.label} Payout — ${dues.leagueName}`,
                            description: `Congratulations ${member?.displayName ?? ''}! Claim your winnings.`,
                        },
                    },
                }],
                after_completion: {
                    type: 'redirect',
                    redirect: { url: `${appUrl()}/api/dues/payout/claimed?itemId=${item.id}` },
                },
            });

            await prisma.payoutProposalItem.update({
                where: { id: item.id },
                data: {
                    memberId,
                    stripePaymentLinkId: paymentLink.id,
                    status: 'payment_link_sent',
                },
            });
        } catch { /* non-fatal — link can be resent */ }
    }

    await prisma.$transaction([
        prisma.payoutProposal.update({ where: { id: proposalId }, data: { status: 'approved' } }),
        prisma.leagueDues.update({ where: { id: duesId }, data: { status: 'approved' } }),
    ]);

    return Response.json({ success: true });
}
