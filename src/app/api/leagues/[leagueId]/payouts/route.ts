import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

interface PayoutEntry {
    rank:     number;
    amount:   number;
    teamId:   string;
    teamName: string;
}

// POST /api/leagues/[leagueId]/payouts
// Commissioner records payout amounts + winning teams.
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

    let body: { payouts?: PayoutEntry[] };
    try {
        body = await request.json() as { payouts?: PayoutEntry[] };
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { payouts } = body;

    if (!Array.isArray(payouts) || payouts.length === 0) {
        return NextResponse.json({ error: 'payouts array required' }, { status: 400 });
    }

    // Validate each entry
    for (const p of payouts) {
        if (!Number.isInteger(p.rank) || p.rank < 1) {
            return NextResponse.json({ error: `Invalid rank: ${p.rank}` }, { status: 400 });
        }
        if (typeof p.amount !== 'number' || p.amount < 0) {
            return NextResponse.json({ error: `Invalid amount for rank ${p.rank}` }, { status: 400 });
        }
        if (!p.teamId || typeof p.teamId !== 'string') {
            return NextResponse.json({ error: `Missing teamId for rank ${p.rank}` }, { status: 400 });
        }
        if (!p.teamName || typeof p.teamName !== 'string') {
            return NextResponse.json({ error: `Missing teamName for rank ${p.rank}` }, { status: 400 });
        }
    }

    // Upsert payouts + winners — run as separate parallel upserts (idempotent)
    await Promise.all([
        ...payouts.map(p =>
            prisma.leaguePayout.upsert({
                where:  { leagueId_rank: { leagueId, rank: p.rank } },
                create: { leagueId, rank: p.rank, amount: p.amount, paidBy: userId },
                update: { amount: p.amount },
            })
        ),
        ...payouts.map(p =>
            prisma.leaguePayoutWinner.upsert({
                where:  { leagueId_rank: { leagueId, rank: p.rank } },
                create: { leagueId, rank: p.rank, teamId: p.teamId, teamName: p.teamName },
                update: { teamId: p.teamId, teamName: p.teamName },
            })
        ),
    ]);

    return NextResponse.json({ ok: true });
}

// GET /api/leagues/[leagueId]/payouts
// Returns existing payouts + winners.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leagueId } = await params;

    const [payouts, winners] = await Promise.all([
        prisma.leaguePayout.findMany({
            where:   { leagueId },
            orderBy: { rank: 'asc' },
        }),
        prisma.leaguePayoutWinner.findMany({
            where:   { leagueId },
            orderBy: { rank: 'asc' },
        }),
    ]);

    return NextResponse.json({ payouts, winners }, {
        headers: { 'Cache-Control': 'private, max-age=60' },
    });
}
