import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ duesId: string }> }): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true, buyInAmount: true, teamCount: true },
    });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { spots?: { id?: string; label: string; amount: number; sortOrder: number }[] };
    const { spots } = body;
    if (!spots || spots.length === 0) return Response.json({ error: 'At least one payout spot is required.' }, { status: 400 });

    const fullPot = dues.buyInAmount * dues.teamCount;
    const total = spots.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(total - fullPot) > 0.01) {
        return Response.json({ error: `Spots must sum to $${fullPot.toFixed(2)}. Got $${total.toFixed(2)}.` }, { status: 400 });
    }

    // Replace all existing spots
    await prisma.$transaction([
        prisma.payoutSpot.deleteMany({ where: { leagueDuesId: duesId } }),
        prisma.payoutSpot.createMany({
            data: spots.map(s => ({
                leagueDuesId: duesId,
                label: s.label,
                amount: s.amount,
                sortOrder: s.sortOrder,
            })),
        }),
    ]);

    return Response.json({ success: true });
}
