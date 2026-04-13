import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLAYERS } from '@/lib/trade-engine';
import type { Player } from '@/lib/trade-engine';

// Default baseValues for depth players not in the top-300 list
const DEPTH_BASE: Record<string, number> = {
    QB:  22, RB:  18, WR:  18, TE:  14,
    K:    8, DEF:  8,
};

export async function GET(request: NextRequest): Promise<Response> {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) return Response.json([]);

    const ql = q.toLowerCase();

    // 1. Matches from the curated top-300 list (have exact baseValues)
    const staticMatches = PLAYERS.filter(p =>
        p.name.toLowerCase().includes(ql) ||
        p.position.toLowerCase() === ql ||
        p.team.toLowerCase() === ql
    ).slice(0, 8);

    const staticNames = new Set(staticMatches.map(p => p.name.toLowerCase()));

    // 2. DB matches not already in the static list
    const dbMatches = await prisma.sleeperPlayer.findMany({
        where: {
            OR: [{ active: true }, { team: { not: 'FA' } }],
            fullName: { contains: q, mode: 'insensitive' },
        },
        select: { fullName: true, position: true, team: true, age: true },
        orderBy: { fullName: 'asc' },
        take: 20,
    });

    const dbPlayers: Player[] = dbMatches
        .filter(p => !staticNames.has(p.fullName.toLowerCase()))
        .slice(0, 8 - staticMatches.length)
        .map((p, i) => ({
            rank:      300 + i + 1,
            name:      p.fullName,
            position:  p.position,
            team:      p.team,
            age:       p.age ?? 26,
            baseValue: DEPTH_BASE[p.position] ?? 10,
        }));

    return Response.json([...staticMatches, ...dbPlayers].slice(0, 10));
}
