import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLAYERS } from '@/lib/trade-engine';
import type { Player } from '@/lib/trade-engine';

// Default baseValues for depth players not in the top-300 list
const DEPTH_BASE: Record<string, number> = {
    QB:  22, RB:  18, WR:  18, TE:  14,
    K:    8, DEF:  8,
};

function relevanceScore(name: string, q: string): number {
    const nl = name.toLowerCase();
    const ql = q.toLowerCase();
    if (nl === ql)                return 0;
    if (nl.startsWith(ql))       return 1;
    const parts = nl.split(' ');
    if (parts.some(w => w.startsWith(ql))) return 2;
    return 3;
}

export async function GET(request: NextRequest): Promise<Response> {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) return Response.json([]);

    const ql = q.toLowerCase();

    // 1. Pull all DB matches (cast wide net, sort by relevance after)
    const dbMatches = await prisma.sleeperPlayer.findMany({
        where: {
            OR: [{ active: true }, { team: { not: 'FA' } }],
            fullName: { contains: q, mode: 'insensitive' },
        },
        select: { fullName: true, position: true, team: true, age: true },
        take: 50,
    });

    // 2. Build a lookup of curated static values by name
    const staticByName = new Map(PLAYERS.map(p => [p.name.toLowerCase(), p]));

    // 3. Merge: use curated value if available, override team from live DB data.
    //    This ensures scheme fit / badges always reflect current roster assignments.
    const merged: Player[] = dbMatches.map((p, i) => {
        const curated = staticByName.get(p.fullName.toLowerCase());
        if (curated) {
            return {
                ...curated,
                team: p.team ?? curated.team,  // live team overrides hardcoded
                age:  p.age  ?? curated.age,   // live age overrides hardcoded
            };
        }
        return {
            rank:      300 + i + 1,
            name:      p.fullName,
            position:  p.position,
            team:      p.team,
            age:       p.age ?? 26,
            baseValue: DEPTH_BASE[p.position] ?? 10,
        };
    });

    // 4. Sort: curated (higher baseValue) first, then by name relevance
    merged.sort((a, b) => {
        const ra = relevanceScore(a.name, ql);
        const rb = relevanceScore(b.name, ql);
        if (ra !== rb) return ra - rb;
        // Within same relevance bucket: higher baseValue first
        return b.baseValue - a.baseValue;
    });

    return Response.json(merged.slice(0, 12));
}
