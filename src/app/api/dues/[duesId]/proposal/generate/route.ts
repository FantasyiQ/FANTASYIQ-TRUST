import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ duesId: string }> }): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        include: {
            members: { where: { duesStatus: 'paid' }, orderBy: { createdAt: 'asc' } },
            payoutSpots: { orderBy: { sortOrder: 'asc' } },
        },
    });

    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const fullPot = dues.buyInAmount * dues.teamCount;
    if (dues.potTotal < fullPot) return Response.json({ error: 'Pot is not complete. All members must pay before generating a proposal.' }, { status: 400 });
    if (dues.payoutSpots.length === 0) return Response.json({ error: 'Set up payout spots first.' }, { status: 400 });

    // Create proposal with unassigned items — commissioner will assign members to spots
    const proposal = await prisma.payoutProposal.create({
        data: {
            leagueDuesId: duesId,
            status: 'pending_commissioner',
            items: {
                create: dues.payoutSpots.map(spot => ({
                    payoutSpotId: spot.id,
                    // Assign first N members as placeholder — commissioner edits before approving
                    memberId: dues.members[0]?.id ?? dues.members[0]?.id,
                    amount: spot.amount,
                    status: 'pending',
                })),
            },
        },
    });

    await prisma.leagueDues.update({ where: { id: duesId }, data: { status: 'pending_approval' } });

    return Response.json({ id: proposal.id });
}
