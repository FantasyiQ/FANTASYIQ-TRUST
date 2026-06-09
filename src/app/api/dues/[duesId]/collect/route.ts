import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// PATCH /api/dues/[duesId]/collect
// Commissioner records cash received — increments collectedAmount.
export async function PATCH(
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
        select: { commissionerId: true, buyInAmount: true, teamCount: true, collectedAmount: true },
    });
    if (!dues) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { amount?: number; note?: string };
    const { amount, note } = body;
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
        return Response.json({ error: 'amount must be a positive number.' }, { status: 400 });
    }

    // Guard: cannot collect more than the full pot (buyIn × teamCount)
    const maxPot = dues.buyInAmount * dues.teamCount;
    if (dues.collectedAmount + amount > maxPot) {
        return Response.json({
            error: `Cannot record more than the full pot ($${maxPot.toFixed(2)}). Current collected: $${dues.collectedAmount.toFixed(2)}.`,
        }, { status: 409 });
    }

    const updated = await prisma.leagueDues.update({
        where: { id: duesId },
        data: { collectedAmount: { increment: amount } },
        select: { collectedAmount: true },
    });

    // Audit log
    prisma.paymentAuditLog.create({
        data: {
            leagueDuesId: duesId,
            actorId:  user.id,
            action:   'cash_collected',
            amount,
            note: note ?? null,
        },
    }).catch(err => console.error('[collect] audit log failed', err));

    return Response.json({ collectedAmount: updated.collectedAmount });
}
