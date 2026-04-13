import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const TRANSITIONS: Record<string, string> = {
    setup: 'open',
    open: 'locked',
    locked: 'scoring',
    scoring: 'complete',
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ contestId: string }> },
): Promise<Response> {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const contest = await prisma.proBowlContest.findUnique({
        where: { id: contestId },
        select: { id: true, status: true, commissionerId: true },
    });
    if (!contest) return Response.json({ error: 'Contest not found.' }, { status: 404 });
    if (contest.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { status?: string };
    const nextStatus = body.status;
    if (!nextStatus) return Response.json({ error: 'status is required.' }, { status: 400 });
    if (TRANSITIONS[contest.status] !== nextStatus) {
        return Response.json({ error: `Cannot transition from ${contest.status} to ${nextStatus}.` }, { status: 400 });
    }

    await prisma.proBowlContest.update({ where: { id: contestId }, data: { status: nextStatus } });
    return Response.json({ success: true });
}
