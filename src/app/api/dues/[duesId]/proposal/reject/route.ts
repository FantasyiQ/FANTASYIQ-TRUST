import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ duesId: string }> }): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({ where: { id: duesId }, select: { commissionerId: true } });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { proposalId?: string };
    const { proposalId } = body;
    if (!proposalId) return Response.json({ error: 'proposalId is required.' }, { status: 400 });

    const proposal = await prisma.payoutProposal.findUnique({ where: { id: proposalId }, select: { id: true, leagueDuesId: true, status: true } });
    if (!proposal || proposal.leagueDuesId !== duesId) return Response.json({ error: 'Proposal not found.' }, { status: 404 });
    if (proposal.status !== 'pending_commissioner') return Response.json({ error: 'Proposal cannot be rejected at this stage.' }, { status: 400 });

    // Open a poll — expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
        prisma.payoutProposal.update({ where: { id: proposalId }, data: { status: 'polling' } }),
        prisma.leaguePoll.create({
            data: {
                proposalId,
                question: 'Do you approve the proposed payout assignments?',
                expiresAt,
                status: 'open',
            },
        }),
        prisma.leagueDues.update({ where: { id: duesId }, data: { status: 'pending_approval' } }),
    ]);

    return Response.json({ success: true });
}
