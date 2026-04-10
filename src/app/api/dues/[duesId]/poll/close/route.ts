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

    const body = await request.json() as { pollId?: string };
    const { pollId } = body;
    if (!pollId) return Response.json({ error: 'pollId is required.' }, { status: 400 });

    const poll = await prisma.leaguePoll.findUnique({
        where: { id: pollId },
        include: { votes: true, proposal: { select: { id: true, leagueDuesId: true } } },
    });
    if (!poll || poll.proposal.leagueDuesId !== duesId) return Response.json({ error: 'Poll not found.' }, { status: 404 });
    if (poll.status !== 'open') return Response.json({ error: 'Poll is already closed.' }, { status: 400 });

    const totalMembers = await prisma.duesMember.count({ where: { leagueDuesId: duesId } });
    const yesVotes = poll.votes.filter(v => v.vote).length;
    const yesPct = totalMembers > 0 ? (yesVotes / totalMembers) * 100 : 0;

    if (yesPct >= 75) {
        await prisma.$transaction([
            prisma.leaguePoll.update({ where: { id: pollId }, data: { status: 'passed' } }),
            prisma.payoutProposal.update({ where: { id: poll.proposalId }, data: { status: 'poll_passed' } }),
            prisma.leagueDues.update({ where: { id: duesId }, data: { status: 'approved' } }),
        ]);
        return Response.json({ result: 'passed', yesPct: Math.round(yesPct) });
    } else {
        await prisma.$transaction([
            prisma.leaguePoll.update({ where: { id: pollId }, data: { status: 'failed' } }),
            prisma.payoutProposal.update({ where: { id: poll.proposalId }, data: { status: 'poll_failed' } }),
            prisma.leagueDues.update({ where: { id: duesId }, data: { status: 'pending_approval' } }),
        ]);
        return Response.json({ result: 'failed', yesPct: Math.round(yesPct) });
    }
}
