import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST — bulk-create a FutureDuesObligation for every member in the tracker for a given season
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json() as { duesId?: string; season?: string };
    const { duesId, season } = body;
    if (!duesId || !season) return Response.json({ error: 'duesId and season are required' }, { status: 400 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: {
            commissionerId: true,
            buyInAmount: true,
            members: { select: { id: true } },
            futureDues: { where: { season }, select: { memberId: true } },
        },
    });
    if (!dues) return Response.json({ error: 'Tracker not found' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Only add members that don't already have an obligation for this season
    const alreadySet = new Set(dues.futureDues.map(f => f.memberId));
    const newMembers = dues.members.filter(m => !alreadySet.has(m.id));

    if (newMembers.length === 0) {
        return Response.json({ added: 0, message: 'All members already have an obligation for this season.' });
    }

    await prisma.futureDuesObligation.createMany({
        data: newMembers.map(m => ({
            leagueDuesId: duesId,
            memberId: m.id,
            season,
            amount: dues.buyInAmount,
        })),
        skipDuplicates: true,
    });

    return Response.json({ added: newMembers.length });
}
