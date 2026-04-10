import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const body = await request.json() as { pollId?: string; memberId?: string; vote?: boolean };
    const { pollId, memberId, vote } = body;
    if (!pollId || !memberId || vote === undefined) return Response.json({ error: 'pollId, memberId, and vote are required.' }, { status: 400 });

    const poll = await prisma.leaguePoll.findUnique({
        where: { id: pollId },
        select: { id: true, status: true, expiresAt: true, proposalId: true },
    });
    if (!poll) return Response.json({ error: 'Poll not found.' }, { status: 404 });
    if (poll.status !== 'open') return Response.json({ error: 'Poll is closed.' }, { status: 400 });
    if (new Date() > new Date(poll.expiresAt)) return Response.json({ error: 'Poll has expired.' }, { status: 400 });

    // Verify member belongs to this poll's league and is linked to this user
    const member = await prisma.duesMember.findUnique({
        where: { id: memberId },
        select: { id: true, userId: true, leagueDuesId: true },
    });
    if (!member || member.userId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    // Check not already voted
    const existing = await prisma.pollVote.findUnique({ where: { pollId_memberId: { pollId, memberId } } });
    if (existing) return Response.json({ error: 'You have already voted.' }, { status: 400 });

    await prisma.pollVote.create({ data: { pollId, memberId, vote } });

    // Check if 75% threshold is now met — auto-close if so
    const allVotes = await prisma.pollVote.findMany({ where: { pollId } });
    const totalMembers = await prisma.duesMember.count({ where: { leagueDuesId: member.leagueDuesId } });
    const yesVotes = allVotes.filter(v => v.vote).length;
    const yesPct = (yesVotes / totalMembers) * 100;

    if (yesPct >= 75) {
        // Auto-pass: proposal stands, commissioner overruled
        await prisma.$transaction([
            prisma.leaguePoll.update({ where: { id: pollId }, data: { status: 'passed' } }),
            prisma.payoutProposal.update({ where: { id: poll.proposalId }, data: { status: 'poll_passed' } }),
            prisma.leagueDues.update({ where: { id: member.leagueDuesId }, data: { status: 'approved' } }),
        ]);
    }

    return Response.json({ success: true, yesPct: Math.round(yesPct) });
}
