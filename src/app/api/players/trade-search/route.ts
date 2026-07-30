import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAge } from '@/lib/calculateAge';
import type { Player } from '@/lib/trade-engine';
import { checkSearchLimit, getClientIp } from '@/lib/ratelimit';
import { normalizePlayerName } from '@/lib/playerName';

const VALUE_CAP = 9999;
function normaliseFc(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / VALUE_CAP) * 100)));
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
    const rl = await checkSearchLimit(getClientIp(request));
    if (rl.limited) return rl.response;

    const q = (request.nextUrl.searchParams.get('q')?.trim() ?? '').slice(0, 100);
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
            select: { nameLower: true, position: true, dynastyValue: true, redraftValue: true },
        }),
    ]);

    // Some real players share an exact fullName (e.g. two "Justin Jefferson"s —
    // WR/MIN and LB/CLE). Match by name+position first (exact, then normalized
    // name); only fall back to a bare name match when that name is unambiguous, so
    // a Sleeper search result never inherits a different player's dynasty value.
    type FcRow = typeof fcRows[number];
    const byNamePos     = new Map<string, FcRow>();
    const byNormNamePos = new Map<string, FcRow>();
    const byNameCount     = new Map<string, number>();
    const byName          = new Map<string, FcRow>();
    const byNormNameCount = new Map<string, number>();
    const byNormName      = new Map<string, FcRow>();
    for (const r of fcRows) {
        const normd = normalizePlayerName(r.nameLower);
        byNamePos.set(`${r.nameLower}|${r.position}`, r);
        byNormNamePos.set(`${normd}|${r.position}`, r);
        byNameCount.set(r.nameLower, (byNameCount.get(r.nameLower) ?? 0) + 1);
        byName.set(r.nameLower, r);
        byNormNameCount.set(normd, (byNormNameCount.get(normd) ?? 0) + 1);
        byNormName.set(normd, r);
    }
    function resolveFc(nameLower: string, position: string): FcRow | undefined {
        const normd = normalizePlayerName(nameLower);
        return byNamePos.get(`${nameLower}|${position}`)
            ?? byNormNamePos.get(`${normd}|${position}`)
            ?? (byNameCount.get(nameLower) === 1 ? byName.get(nameLower) : undefined)
            ?? (byNormNameCount.get(normd) === 1 ? byNormName.get(normd) : undefined);
    }

    // 2. Merge: dynasty value wins; fall back to position-based depth default
    const merged: Player[] = dbMatches.map((p, i) => {
        const nameLower = p.fullName.toLowerCase();
        const fcRow  = resolveFc(nameLower, p.position);
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
