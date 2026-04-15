import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
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
        select: { commissionerId: true, buyInAmount: true },
    });
    if (!dues) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { memberId?: string; status?: string };
    const { memberId, status } = body;
    if (!memberId || (status !== 'paid' && status !== 'unpaid')) {
        return Response.json({ error: 'memberId and status (paid|unpaid) required.' }, { status: 400 });
    }

    const member = await prisma.duesMember.findUnique({
        where: { id: memberId },
        select: { leagueDuesId: true, duesStatus: true },
    });
    if (!member || member.leagueDuesId !== duesId) {
        return Response.json({ error: 'Member not found.' }, { status: 404 });
    }

    const wasAlreadyPaid = member.duesStatus === 'paid';
    const nowPaid = status === 'paid';

    await prisma.duesMember.update({
        where: { id: memberId },
        data: {
            duesStatus: status,
            paidAt: nowPaid ? new Date() : null,
            paymentMethod: nowPaid ? 'manual' : null,
        },
    });

    // Keep potTotal in sync
    if (wasAlreadyPaid !== nowPaid) {
        await prisma.leagueDues.update({
            where: { id: duesId },
            data: {
                potTotal: nowPaid
                    ? { increment: dues.buyInAmount }
                    : { decrement: dues.buyInAmount },
            },
        });
    }

    return Response.json({ ok: true });
}
