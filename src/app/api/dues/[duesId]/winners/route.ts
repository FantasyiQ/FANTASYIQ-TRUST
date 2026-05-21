import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// POST — upsert winners for a duesId (commissioner only)
// Body: { winners: Array<{ rank: number; teamName: string; displayName?: string; amount: number }> }
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response;

    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const dues = await prisma.leagueDues.findUnique({
        where:  { id: duesId },
        select: { commissionerId: true },
    });
    if (!dues || dues.commissionerId !== session.user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json() as {
        winners: Array<{ rank: number; teamName: string; displayName?: string; amount: number }>;
    };
    if (!body.winners?.length) return Response.json({ error: 'winners[] required' }, { status: 400 });

    // Upsert each winner by rank
    await Promise.all(body.winners.map(w =>
        prisma.leagueWinner.upsert({
            where:  { leagueDuesId_rank: { leagueDuesId: duesId, rank: w.rank } },
            create: { leagueDuesId: duesId, rank: w.rank, teamName: w.teamName, displayName: w.displayName ?? null, amount: w.amount },
            update: { teamName: w.teamName, displayName: w.displayName ?? null, amount: w.amount },
        })
    ));

    return Response.json({ ok: true });
}

// PATCH — mark all winners as paidOut=true, set LeagueDues.status='paid_out'
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const dues = await prisma.leagueDues.findUnique({
        where:  { id: duesId },
        select: { commissionerId: true },
    });
    if (!dues || dues.commissionerId !== session.user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    await prisma.$transaction([
        prisma.leagueWinner.updateMany({
            where: { leagueDuesId: duesId },
            data:  { paidOut: true, paidAt: new Date(), paidByUserId: session.user.id },
        }),
        prisma.leagueDues.update({
            where: { id: duesId },
            data:  { status: 'paid_out' },
        }),
    ]);

    return Response.json({ ok: true });
}
