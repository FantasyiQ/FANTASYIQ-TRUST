import { prisma } from '@/lib/prisma';

// Normalise KTC raw value (0–9999) to our 0–100 DTV scale.
const KTC_CAP = 9999;

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / KTC_CAP) * 100)));
}

// Returns a map of lowercase player name → { dynasty, redraft, team, age, trend }
// Used by TradeEvaluator to overlay live KTC values onto hardcoded baseValues.
export async function GET(): Promise<Response> {
    const rows = await prisma.fantasyCalcValue.findMany({
        select: {
            nameLower:      true,
            dynastyValue:   true,
            dynastyValueSf: true,
            redraftValue:   true,
            redraftValueSf: true,
            team:           true,
            age:            true,
            trend30Day:     true,
        },
    });

    const map: Record<string, {
        dynasty:   number;
        dynastySf: number;
        redraft:   number;
        redraftSf: number;
        team:      string | null;
        age:       number | null;
        trend:     number | null;
    }> = {};

    for (const r of rows) {
        map[r.nameLower] = {
            dynasty:   normalise(r.dynastyValue),
            dynastySf: normalise(r.dynastyValueSf),
            redraft:   normalise(r.redraftValue),
            redraftSf: normalise(r.redraftValueSf),
            team:      r.team,
            age:       r.age ? Math.round(r.age) : null,
            trend:     r.trend30Day,
        };
    }

    return Response.json(map, {
        headers: {
            // Cache for 5 min; KTC syncs daily but we want fresh values after each sync
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
    });
}
