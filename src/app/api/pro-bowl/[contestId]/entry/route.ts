import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface LineupSlot {
    position: string;
    playerName: string;
    nflTeam: string;
}

const REQUIRED_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ contestId: string }> },
): Promise<Response> {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const contest = await prisma.proBowlContest.findUnique({
        where: { id: contestId },
        select: { id: true, status: true, leagueDuesId: true },
    });
    if (!contest) return Response.json({ error: 'Contest not found.' }, { status: 404 });
    if (contest.status !== 'open') return Response.json({ error: 'Contest is not open for entries.' }, { status: 400 });

    const body = await request.json() as { lineup?: LineupSlot[] };
    const { lineup } = body;
    if (!lineup || !Array.isArray(lineup) || lineup.length !== REQUIRED_POSITIONS.length) {
        return Response.json({ error: `Lineup must have exactly ${REQUIRED_POSITIONS.length} players.` }, { status: 400 });
    }

    // Validate each slot has required fields and is not blank
    for (const slot of lineup) {
        if (!slot.playerName?.trim() || !slot.nflTeam?.trim() || !slot.position) {
            return Response.json({ error: 'All lineup slots must have a player, NFL team, and position.' }, { status: 400 });
        }
    }

    // Upsert — allow editing until locked
    const entry = await prisma.proBowlEntry.upsert({
        where: { contestId_userId: { contestId, userId: user.id } },
        create: { contestId, userId: user.id, lineup: lineup as unknown as import('@prisma/client').Prisma.JsonArray },
        update: { lineup: lineup as unknown as import('@prisma/client').Prisma.JsonArray, updatedAt: new Date() },
        select: { id: true },
    });

    return Response.json({ id: entry.id });
}
