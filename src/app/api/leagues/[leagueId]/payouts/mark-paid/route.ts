import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// POST /api/leagues/[leagueId]/payouts/mark-paid
// Commissioner marks a specific payout rank as paid.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { leagueId } = await params;

    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: { id: true, userId: true },
    });

    if (!league) {
        return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }
    if (league.userId !== userId) {
        return NextResponse.json({ error: 'Commissioner access only' }, { status: 403 });
    }

    let body: { rank?: unknown };
    try {
        body = await request.json() as { rank?: unknown };
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const rank = body.rank;
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) {
        return NextResponse.json({ error: 'rank must be a positive integer' }, { status: 400 });
    }

    const updated = await prisma.leaguePayout.updateMany({
        where: { leagueId, rank, paidAt: null }, // idempotent: only update if not already paid
        data:  { paidAt: new Date(), paidBy: userId },
    });

    if (updated.count === 0) {
        // Either already paid or rank doesn't exist — not an error
        return NextResponse.json({ ok: true, alreadyPaid: true });
    }

    return NextResponse.json({ ok: true });
}
