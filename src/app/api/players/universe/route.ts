import { prisma } from '@/lib/prisma';
import type { UniversePlayer, UniverseResponse } from '@/lib/player-universe';
import { calculateAge } from '@/lib/calculateAge';

const KTC_CAP = 9999;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / KTC_CAP) * 100)));
}

function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Returns the full dynamic player universe: all KTC-ranked skill-position players
// merged with live Sleeper team/injury/age data, sorted by dynasty value desc.
export async function GET(): Promise<Response> {
    const [ktcRows, sleeperPlayers, latestSync] = await Promise.all([
        prisma.fantasyCalcValue.findMany({
            where: {
                position: { in: ['QB', 'RB', 'WR', 'TE'] },
                OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }],
            },
            select: {
                playerName:     true,
                nameLower:      true,
                position:       true,
                dynastyValue:   true,
                dynastyValueSf: true,
                redraftValue:   true,
                redraftValueSf: true,
                age:            true,
                trend30Day:     true,
            },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true, position: { in: ['QB', 'RB', 'WR', 'TE'] } },
            select: { playerId: true, fullName: true, team: true, injuryStatus: true, birthDate: true, age: true },
        }),
        // Latest KTC sync time — max updatedAt across all rows
        prisma.fantasyCalcValue.findFirst({
            orderBy: { updatedAt: 'desc' },
            select:  { updatedAt: true },
        }),
    ]);

    // Build Sleeper lookup maps (exact name + normalized)
    const sleeperExact      = new Map<string, typeof sleeperPlayers[number]>();
    const sleeperNormalized = new Map<string, typeof sleeperPlayers[number]>();

    for (const p of sleeperPlayers) {
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        if (!sleeperExact.has(exact))      sleeperExact.set(exact, p);
        if (!sleeperNormalized.has(normd)) sleeperNormalized.set(normd, p);
    }

    const players: UniversePlayer[] = ktcRows
        .filter(r => SKILL_POSITIONS.has(r.position))
        .map(r => {
            const exact   = r.nameLower;
            const normd   = normalizeName(r.nameLower);
            const sleeper = sleeperExact.get(exact) ?? sleeperNormalized.get(normd) ?? null;

            const rawTeam = sleeper?.team ?? null;
            const team    = (rawTeam && rawTeam !== 'FA') ? rawTeam : null;
            const age     = calculateAge(sleeper?.birthDate) ?? sleeper?.age ?? (r.age ? Math.round(r.age) : null);

            return {
                name:            r.playerName,
                position:        r.position,
                team,
                age,
                dynasty:         normalise(r.dynastyValue),
                dynastySf:       normalise(r.dynastyValueSf),
                redraft:         normalise(r.redraftValue),
                redraftSf:       normalise(r.redraftValueSf),
                trend:           r.trend30Day ?? null,
                injuryStatus:    sleeper?.injuryStatus ?? null,
                birthDate:       sleeper?.birthDate ?? null,
                playerImageUrl:  sleeper ? `https://sleepercdn.com/content/nfl/players/${sleeper.playerId}.jpg` : null,
            };
        })
        .sort((a, b) => b.dynasty - a.dynasty || a.name.localeCompare(b.name));

    const body: UniverseResponse = {
        meta: {
            generatedAt: new Date().toISOString(),
            ktcSyncedAt: latestSync?.updatedAt.toISOString() ?? null,
            playerCount: players.length,
        },
        players,
    };

    return Response.json(body, {
        headers: {
            // 5-min cache — KTC and Sleeper both sync daily
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
    });
}
