import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH /api/dues/[duesId]/collect
// Commissioner records cash received — increments collectedAmount.
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
        select: { commissionerId: true },
    });
    if (!dues) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { amount?: number };
    const amount = body.amount;
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
        return Response.json({ error: 'amount must be a positive number.' }, { status: 400 });
    }

    const updated = await prisma.leagueDues.update({
        where: { id: duesId },
        data: { collectedAmount: { increment: amount } },
        select: { collectedAmount: true },
    });

    return Response.json({ collectedAmount: updated.collectedAmount });
}
