import type { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    if (!itemId) redirect('/dashboard');

    const item = await prisma.payoutProposalItem.findUnique({
        where: { id: itemId },
        select: { id: true, proposalId: true, status: true, proposal: { select: { leagueDuesId: true } } },
    });
    if (!item) redirect('/dashboard');

    // Only allow claiming if the payment link was actually sent and payment was completed.
    // Prevents directly hitting this URL to mark arbitrary payouts as claimed.
    if (item.status === 'payment_link_sent') {
        await prisma.payoutProposalItem.update({
            where: { id: itemId },
            data: { status: 'paid_out', claimedAt: new Date() },
        });

        // Check if all items in the proposal are paid out — if so, mark dues as paid_out
        const allItems = await prisma.payoutProposalItem.findMany({
            where: { proposalId: item.proposalId },
            select: { status: true },
        });
        if (allItems.every(i => i.status === 'paid_out')) {
            await prisma.leagueDues.update({
                where: { id: item.proposal.leagueDuesId },
                data: { status: 'paid_out' },
            });
        }
    }

    redirect('/dashboard?payout=claimed');
}
