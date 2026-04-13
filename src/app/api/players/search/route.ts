import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/players/search?q=mahomes&position=QB&season=2025&week=1
// Returns players with injury status and (optionally) weekly projection.
export async function GET(request: NextRequest): Promise<Response> {
    const { searchParams } = request.nextUrl;
    const q        = searchParams.get('q')?.trim() ?? '';
    const position = searchParams.get('position') ?? '';
    const season   = searchParams.get('season') ?? '';
    const week     = searchParams.get('week') ? parseInt(searchParams.get('week')!) : null;

    if (q.length < 2) return Response.json([]);

    const players = await prisma.sleeperPlayer.findMany({
        where: {
            OR: [{ active: true }, { team: { not: 'FA' } }],
            fullName: { contains: q, mode: 'insensitive' },
            ...(position ? { position } : {}),
        },
        select: {
            playerId:       true,
            fullName:       true,
            position:       true,
            team:           true,
            jerseyNumber:   true,
            height:         true,
            weight:         true,
            age:            true,
            injuryStatus:   true,
            injuryBodyPart: true,
            projections:    season && week != null ? {
                where: { season, week },
                select: { pointsPpr: true, pointsStd: true, pointsHalfPpr: true },
                take: 1,
            } : false,
        },
        orderBy: { fullName: 'asc' },
        take: 20,
    });

    return Response.json(players);
}
