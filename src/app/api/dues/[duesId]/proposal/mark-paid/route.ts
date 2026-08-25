import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// POST /api/dues/[duesId]/proposal/mark-paid
// Commissioner marks a Connect-routed payout item as paid — used instead of
// the Stripe claim-link flow, since the commissioner already holds the money
// in their own account and pays winners directly (Venmo/check/etc).
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
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where:  { id: duesId },
        select: { commissionerId: true },
    });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { itemId?: string; note?: string };
    const { itemId, note } = body;
    if (!itemId) return Response.json({ error: 'itemId is required.' }, { status: 400 });
    if (note !== undefined && typeof note !== 'string') {
        return Response.json({ error: 'note must be a string.' }, { status: 400 });
    }

    const item = await prisma.payoutProposalItem.findUnique({
        where:   { id: itemId },
        include: { proposal: { select: { leagueDuesId: true } }, member: { select: { displayName: true } } },
    });
    if (!item || item.proposal.leagueDuesId !== duesId) {
        return Response.json({ error: 'Payout item not found.' }, { status: 404 });
    }
    if (item.status === 'paid_out') {
        return Response.json({ error: 'Already marked paid.' }, { status: 400 });
    }
    if (item.status !== 'approved') {
        return Response.json({ error: `Cannot mark an item in status "${item.status}" as paid.` }, { status: 409 });
    }

    await prisma.payoutProposalItem.update({
        where: { id: itemId },
        data:  { status: 'paid_out', claimedAt: new Date() },
    });

    // Reuse the same audit-log table dues collection already writes to —
    // consistent record of who marked what paid, and how.
    prisma.paymentAuditLog.create({
        data: {
            leagueDuesId: duesId,
            memberId:     item.memberId,
            actorId:      user.id,
            action:       'payout_paid_manually',
            amount:       item.amount,
            note:         note?.trim() || null,
        },
    }).catch(err => console.error('[proposal/mark-paid] audit log failed', err));

    return Response.json({ ok: true });
}
