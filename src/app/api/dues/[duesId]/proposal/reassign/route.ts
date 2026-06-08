import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true },
    });
    if (!dues) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { itemId?: string; newMemberId?: string };
    const { itemId, newMemberId } = body;
    if (!itemId || !newMemberId) {
        return Response.json({ error: 'itemId and newMemberId required.' }, { status: 400 });
    }

    // Load the payout item with its parent proposal
    const item = await prisma.payoutProposalItem.findUnique({
        where: { id: itemId },
        include: { proposal: { select: { leagueDuesId: true, status: true } } },
    });
    if (!item || item.proposal.leagueDuesId !== duesId) {
        return Response.json({ error: 'Payout item not found.' }, { status: 404 });
    }

    // Only reassign on approved proposals — once a transfer is initiated, it's too late
    const proposalStatus = item.proposal.status;
    if (proposalStatus !== 'approved' && proposalStatus !== 'poll_passed') {
        return Response.json({
            error: 'Payouts can only be reassigned after the proposal is approved.',
        }, { status: 409 });
    }

    // Only reassign items that have not yet had a claim link sent
    if (item.status !== 'pending') {
        return Response.json({
            error: `This payout is already in "${item.status}" status and cannot be reassigned.`,
        }, { status: 409 });
    }

    // Validate the new recipient belongs to this dues tracker
    const newMember = await prisma.duesMember.findUnique({
        where: { id: newMemberId },
        select: { leagueDuesId: true, userId: true, displayName: true },
    });
    if (!newMember || newMember.leagueDuesId !== duesId) {
        return Response.json({ error: 'Recipient not found in this league.' }, { status: 404 });
    }

    // New recipient must have a FiQ account — required to receive Stripe payouts
    if (!newMember.userId) {
        return Response.json({
            error: `${newMember.displayName} must create a FiQ account before they can receive payouts.`,
        }, { status: 422 });
    }

    await prisma.payoutProposalItem.update({
        where: { id: itemId },
        data:  { memberId: newMemberId },
    });

    return Response.json({ ok: true, newRecipient: newMember.displayName });
}
