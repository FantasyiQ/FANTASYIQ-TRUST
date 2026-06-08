import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function POST(request: NextRequest): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const body = await request.json() as { memberId?: string; duesId?: string };
    const { memberId, duesId } = body;
    if (!memberId || !duesId) {
        return Response.json({ error: 'memberId and duesId required.' }, { status: 400 });
    }

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true },
    });
    if (!dues) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const member = await prisma.duesMember.findUnique({
        where: { id: memberId },
        select: { leagueDuesId: true, duesStatus: true, displayName: true },
    });
    if (!member || member.leagueDuesId !== duesId) {
        return Response.json({ error: 'Member not found.' }, { status: 404 });
    }

    if (member.duesStatus === 'paid') {
        return Response.json({
            error: `${member.displayName}'s seat is paid and locked. Paid members cannot be removed from the league.`,
        }, { status: 403 });
    }

    await prisma.duesMember.delete({ where: { id: memberId } });
    return Response.json({ ok: true });
}
