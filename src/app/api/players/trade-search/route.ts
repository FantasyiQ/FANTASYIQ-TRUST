import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLAYERS } from '@/lib/trade-engine';
import type { Player } from '@/lib/trade-engine';

const FC_CAP = 10000;
function normaliseFc(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / FC_CAP) * 100)));
}

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
    const [dbMatches, fcRows] = await Promise.all([
        prisma.sleeperPlayer.findMany({
            where: {
                OR: [{ active: true }, { team: { not: 'FA' } }],
                fullName: { contains: q, mode: 'insensitive' },
            },
            select: { fullName: true, position: true, team: true, age: true },
            take: 50,
        }),
        prisma.fantasyCalcValue.findMany({
            where: { nameLower: { contains: ql } },
            select: { nameLower: true, dynastyValue: true, redraftValue: true },
        }),
    ]);

    // 2. Build lookups
    const staticByName = new Map(PLAYERS.map(p => [p.name.toLowerCase(), p]));
    const fcByName = new Map(fcRows.map(r => [r.nameLower, r]));

    // 3. Merge: FC baseValue > curated > depth default
    // Use redraft value by default for search (client applies dynasty/redraft via patchPlayer)
    const merged: Player[] = dbMatches.map((p, i) => {
        const nameLower = p.fullName.toLowerCase();
        const fcRow  = fcByName.get(nameLower);
        const curated = staticByName.get(nameLower);
        // Use the higher of dynasty/redraft as the neutral search baseValue
        const fcValue = fcRow !== undefined
            ? normaliseFc(Math.max(fcRow.dynastyValue, fcRow.redraftValue))
            : undefined;
        if (curated) {
            // Only override if FC value is within reason (>40% of hardcoded)
            const useFC = fcValue !== undefined && fcValue > curated.baseValue * 0.4;
            return {
                ...curated,
                team:      p.team ?? curated.team,
                age:       p.age  ?? curated.age,
                baseValue: useFC ? fcValue : curated.baseValue,
            };
        }
        return {
            rank:      300 + i + 1,
            name:      p.fullName,
            position:  p.position,
            team:      p.team,
            age:       p.age ?? 26,
            baseValue: fcValue ?? (DEPTH_BASE[p.position] ?? 10),
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
