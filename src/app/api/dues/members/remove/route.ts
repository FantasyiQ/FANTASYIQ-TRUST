import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { memberId?: string; duesId?: string };
    const { memberId, duesId } = body;
    if (!memberId || !duesId) return Response.json({ error: 'memberId and duesId are required.' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({ where: { id: duesId }, select: { commissionerId: true } });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const member = await prisma.duesMember.findUnique({ where: { id: memberId }, select: { duesStatus: true, leagueDuesId: true } });
    if (!member || member.leagueDuesId !== duesId) return Response.json({ error: 'Member not found.' }, { status: 404 });
    if (member.duesStatus === 'paid') return Response.json({ error: 'Cannot remove a member who has already paid.' }, { status: 400 });

    await prisma.duesMember.delete({ where: { id: memberId } });
    return Response.json({ success: true });
}
