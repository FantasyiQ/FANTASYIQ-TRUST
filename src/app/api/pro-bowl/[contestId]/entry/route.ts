import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface SlotConfig {
    position:         string;
    allowedPositions: string[];
}
interface RosterConfig {
    slots: SlotConfig[];
}
interface IncomingSlot {
    position: string;
    playerId: string;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ contestId: string }> },
): Promise<Response> {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const contest = await prisma.proBowlContest.findUnique({
        where:  { id: contestId },
        select: { id: true, openAt: true, lockAt: true, isActive: true, rosterConfigJson: true },
    });
    if (!contest) return Response.json({ error: 'Contest not found.' }, { status: 404 });

    // Validate contest is open
    const now = new Date();
    if (!contest.isActive)     return Response.json({ error: 'Contest is not active.' },        { status: 400 });
    if (now < contest.openAt)  return Response.json({ error: 'Contest is not open yet.' },      { status: 400 });
    if (now >= contest.lockAt) return Response.json({ error: 'Contest entries are locked.' },   { status: 400 });

    const { slots: slotConfigs } = contest.rosterConfigJson as unknown as RosterConfig;

    const body = await request.json() as { slots?: IncomingSlot[] };
    const { slots } = body;

    if (!slots || !Array.isArray(slots) || slots.length !== slotConfigs.length) {
        return Response.json({ error: `Lineup must have exactly ${slotConfigs.length} slots.` }, { status: 400 });
    }

    // Validate position labels match roster order
    for (let i = 0; i < slotConfigs.length; i++) {
        if (slots[i].position !== slotConfigs[i].position) {
            return Response.json({
                error: `Slot ${i + 1} must be position ${slotConfigs[i].position}.`,
            }, { status: 400 });
        }
    }

    // Validate player IDs exist and their NFL position is eligible for the slot
    const playerIds = slots.map(s => s.playerId);
    const players   = await prisma.sleeperPlayer.findMany({
        where:  { playerId: { in: playerIds } },
        select: { playerId: true, position: true },
    });
    const playerMap = new Map(players.map(p => [p.playerId, p]));

    for (let i = 0; i < slotConfigs.length; i++) {
        const player = playerMap.get(slots[i].playerId);
        if (!player) {
            return Response.json({ error: `Player ${slots[i].playerId} not found.` }, { status: 400 });
        }
        if (!slotConfigs[i].allowedPositions.includes(player.position ?? '')) {
            return Response.json({
                error: `${player.position} is not eligible for the ${slotConfigs[i].position} slot.`,
            }, { status: 400 });
        }
    }

    // Upsert entry and replace slots
    const entry = await prisma.proBowlEntry.upsert({
        where:  { contestId_userId: { contestId, userId: user.id } },
        create: { contestId, userId: user.id },
        update: { updatedAt: new Date() },
        select: { id: true },
    });

    await prisma.proBowlEntrySlot.deleteMany({ where: { entryId: entry.id } });
    await prisma.proBowlEntrySlot.createMany({
        data: slots.map(s => ({
            entryId:  entry.id,
            position: s.position,
            playerId: s.playerId,
            salary:   0,
        })),
    });

    return Response.json({ id: entry.id }, { status: 200 });
}
