import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const FLEX_ELIGIBLE       = new Set(['RB', 'WR', 'TE']);
const SUPER_FLEX_ELIGIBLE = new Set(['QB', 'RB', 'WR', 'TE']);
const IDP_FLEX_ELIGIBLE   = new Set(['LB', 'DL', 'DB', 'DE', 'DT', 'CB', 'S']);

function eligiblePositions(slotPosition: string): string[] {
    switch (slotPosition) {
        case 'FLEX':       return Array.from(FLEX_ELIGIBLE);
        case 'SUPER_FLEX': return Array.from(SUPER_FLEX_ELIGIBLE);
        case 'IDP_FLEX':   return Array.from(IDP_FLEX_ELIGIBLE);
        case 'DEF':        return ['DEF'];
        default:           return [slotPosition];
    }
}

export async function GET(request: NextRequest): Promise<Response> {
    const { searchParams } = request.nextUrl;
    const q        = searchParams.get('q')?.trim() ?? '';
    const position = searchParams.get('position') ?? '';

    if (q.length < 2) return Response.json([]);

    const positions = position ? eligiblePositions(position) : undefined;

    const players = await prisma.sleeperPlayer.findMany({
        where: {
            OR: [{ active: true }, { team: { not: 'FA' } }],
            fullName: { contains: q, mode: 'insensitive' },
            ...(positions ? { position: { in: positions } } : {}),
        },
        select: { playerId: true, fullName: true, position: true, team: true },
        orderBy: { fullName: 'asc' },
        take: 12,
    });

    return Response.json(players);
}
