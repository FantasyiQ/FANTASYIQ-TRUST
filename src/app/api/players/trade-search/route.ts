import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAge } from '@/lib/calculateAge';
import type { Player } from '@/lib/trade-engine';

const KTC_CAP = 9999;
function normaliseFc(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / KTC_CAP) * 100)));
}

// Default baseValues for unranked / non-skill-position players
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
            select: { playerId: true, fullName: true, position: true, team: true, birthDate: true, age: true },
            take: 50,
        }),
        prisma.fantasyCalcValue.findMany({
            where: { nameLower: { contains: ql } },
            select: { nameLower: true, dynastyValue: true, redraftValue: true },
        }),
    ]);

    const fcByName = new Map(fcRows.map(r => [r.nameLower, r]));

    // 2. Merge: KTC value wins; fall back to position-based depth default
    const merged: Player[] = dbMatches.map((p, i) => {
        const nameLower = p.fullName.toLowerCase();
        const fcRow  = fcByName.get(nameLower);
        const fcValue = fcRow !== undefined
            ? normaliseFc(Math.max(fcRow.dynastyValue, fcRow.redraftValue))
            : undefined;
        return {
            rank:            i + 1,
            name:            p.fullName,
            position:        p.position,
            team:            p.team,
            age:             calculateAge(p.birthDate) ?? p.age ?? 0,
            baseValue:       fcValue ?? (DEPTH_BASE[p.position] ?? 10),
            birthDate:       p.birthDate ?? null,
            playerImageUrl:  `https://sleepercdn.com/content/nfl/players/${p.playerId}.jpg`,
            image:           `https://sleepercdn.com/content/nfl/players/${p.playerId}.jpg`,
        };
    });

    // 3. Sort by name relevance, then higher baseValue first
    merged.sort((a, b) => {
        const ra = relevanceScore(a.name, ql);
        const rb = relevanceScore(b.name, ql);
        if (ra !== rb) return ra - rb;
        return b.baseValue - a.baseValue;
    });

    return Response.json(merged.slice(0, 12));
}
