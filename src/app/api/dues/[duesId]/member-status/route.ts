import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

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
        select: { commissionerId: true, buyInAmount: true, collectedAmount: true, leagueName: true },
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
        select: { leagueDuesId: true, duesStatus: true, userId: true, displayName: true },
    });
    if (!member || member.leagueDuesId !== duesId) {
        return Response.json({ error: 'Member not found.' }, { status: 404 });
    }

    const wasAlreadyPaid = member.duesStatus === 'paid';
    const nowPaid = status === 'paid';

    // Enforce pot balance before marking paid.
    // collectedAmount must cover all currently-paid members plus this new one.
    if (nowPaid && !wasAlreadyPaid) {
        const currentPaidCount = await prisma.duesMember.count({
            where: { leagueDuesId: duesId, duesStatus: 'paid' },
        });
        const required = (currentPaidCount + 1) * dues.buyInAmount;
        if (dues.collectedAmount < required) {
            const shortfall = required - dues.collectedAmount;
            return Response.json({
                error: `Pot has $${dues.collectedAmount.toFixed(0)} but needs $${required.toFixed(0)} to mark this member as paid. Add $${shortfall.toFixed(0)} to the pot first.`,
                shortfall,
            }, { status: 409 });
        }
    }

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

    // Fire notifications for manual payment recording
    if (nowPaid && !wasAlreadyPaid) {
        // Notify member if they have a FantasyIQ account
        if (member.userId) {
            notify({
                userId: member.userId,
                type:   NotificationType.DUES_PAYMENT_MANUAL,
                title:  `Payment recorded — ${dues.leagueName ?? duesId}`,
                body:   `Your commissioner has recorded your payment of $${dues.buyInAmount} for ${dues.leagueName ?? 'your league'}.`,
                data: {
                    leagueId:   duesId,
                    leagueName: dues.leagueName,
                    duesId,
                    amount:     dues.buyInAmount,
                },
            }).catch(err => console.error('[member-status] notify member failed', err));
        }

        // Notify commissioner for their own records (in-app only, no email)
        notify({
            userId: user.id,
            type:   NotificationType.DUES_PAYMENT_MANUAL,
            title:  `Payment recorded — ${member.displayName}`,
            body:   `You recorded a manual payment of $${dues.buyInAmount} for ${member.displayName} in ${dues.leagueName ?? 'your league'}.`,
            data: {
                leagueId:   duesId,
                leagueName: dues.leagueName,
                duesId,
                amount:     dues.buyInAmount,
                payer:      member.displayName,
            },
            email: false,
        }).catch(err => console.error('[member-status] notify commissioner failed', err));
    }

    return Response.json({ ok: true });
}
