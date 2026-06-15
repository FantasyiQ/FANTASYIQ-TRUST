import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';
import { validatePayoutTotal } from '@/lib/dues/payout-validation';
import { hasEnoughBalance, dollarsToCents } from '@/lib/stripe/webhook-helpers';

function appUrl() {
    const u = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    if (!u) throw new Error('NEXTAUTH_URL is not configured');
    return u;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ duesId: string }> }): Promise<Response> {

    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where:  { id: duesId },
        select: { commissionerId: true, leagueName: true, potTotal: true },
    });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { proposalId?: string; assignments?: Record<string, string> };
    const { proposalId, assignments } = body;
    if (!proposalId || !assignments) return Response.json({ error: 'proposalId and assignments are required.' }, { status: 400 });

    const proposal = await prisma.payoutProposal.findUnique({
        where: { id: proposalId },
        include: { items: { include: { payoutSpot: true } } },
    });
    if (!proposal || proposal.leagueDuesId !== duesId) return Response.json({ error: 'Proposal not found.' }, { status: 404 });
    if (proposal.status !== 'pending_commissioner') return Response.json({ error: 'Proposal is not pending approval.' }, { status: 400 });

    const validItemIds = new Set(proposal.items.map(i => i.id));
    for (const itemId of Object.keys(assignments)) {
        if (!validItemIds.has(itemId)) return Response.json({ error: 'Invalid item assignment.' }, { status: 400 });
    }

    const memberIds = [...new Set(Object.values(assignments))];
    const validMembers = await prisma.duesMember.findMany({
        where:  { id: { in: memberIds }, leagueDuesId: duesId },
        select: { id: true },
    });
    if (validMembers.length !== memberIds.length) {
        return Response.json({ error: 'Invalid member assignment.' }, { status: 400 });
    }

    // ── Invariant 1: payout plan must equal the pot total ─────────────────────
    // Assigned items only — unassigned spots are skipped
    const assignedItems = proposal.items.filter(i => assignments[i.id]);
    const payoutTotal   = assignedItems.reduce((sum, i) => sum + i.amount, 0);
    const potTotal      = dues.potTotal;

    // ── Invariant 1: payout plan must equal the pot total ─────────────────────
    const totalCheck = validatePayoutTotal(payoutTotal, potTotal);
    if (!totalCheck.valid) {
        return Response.json({ error: totalCheck.error }, { status: totalCheck.status });
    }

    // ── Invariant 2: Stripe platform balance must cover total pending payouts ──
    // This compares against ALL pending payouts across all leagues, not just this one.
    const [stripeBalance, allPendingItems] = await Promise.all([
        stripe.balance.retrieve(),
        prisma.payoutProposalItem.findMany({
            where:  { status: 'claim_sent' },
            select: { amount: true },
        }),
    ]);

    const availableCents      = stripeBalance.available.find(b => b.currency === 'usd')?.amount ?? 0;
    const pendingPayoutsCents = allPendingItems.reduce((sum, i) => sum + dollarsToCents(i.amount), 0);

    if (!hasEnoughBalance(availableCents, pendingPayoutsCents, dollarsToCents(payoutTotal))) {
        const availableDollars    = availableCents / 100;
        const totalPendingDollars = (pendingPayoutsCents / 100) + payoutTotal;
        return Response.json({
            error: `Stripe platform balance ($${availableDollars.toFixed(2)}) is insufficient to cover all pending payouts ($${totalPendingDollars.toFixed(2)}). Contact support.`,
        }, { status: 400 });
    }

    // ── Send claim links to each winner ───────────────────────────────────────
    const base = appUrl();

    for (const item of proposal.items) {
        const memberId = assignments[item.id];
        if (!memberId) continue;

        const member = await prisma.duesMember.findUnique({
            where:  { id: memberId },
            select: { displayName: true, userId: true, email: true },
        });

        const claimToken = randomBytes(32).toString('hex');

        await prisma.payoutProposalItem.update({
            where: { id: item.id },
            data:  { memberId, status: 'claim_sent', winnerClaimToken: claimToken, claimSentAt: new Date() },
        });

        const claimUrl = `${base}/claim-winnings/${claimToken}`;

        if (member?.userId) {
            notify({
                userId: member.userId,
                type:   NotificationType.PAYOUTS_RELEASED,
                title:  `You won! Claim your ${dues.leagueName} payout`,
                body:   `Your ${item.payoutSpot.label} payout of $${item.amount} is ready. Click to claim your winnings.`,
                data:   { leagueId: duesId, leagueName: dues.leagueName, duesId, amount: item.amount, claimUrl },
            }).catch(err => console.error('[approve] notify winner failed', err));
        }
    }

    await prisma.$transaction([
        prisma.payoutProposal.update({ where: { id: proposalId }, data: { status: 'approved' } }),
        prisma.leagueDues.update({ where: { id: duesId }, data: { status: 'approved' } }),
    ]);

    return Response.json({ success: true });
}
