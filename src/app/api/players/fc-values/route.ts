import { prisma } from '@/lib/prisma';

// Normalise FantasyCalc raw value (0–~11000) to our 0–100 DTV scale.
// We use the 99th-percentile cap of 10000 so elite players sit near 100.
const FC_CAP = 10000;

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / FC_CAP) * 100)));
}

// Returns a map of lowercase player name → { dynasty, redraft, team, age, trend }
// Used by TradeEvaluator to override hardcoded baseValues with live FC data.
export async function GET(): Promise<Response> {
    const rows = await prisma.fantasyCalcValue.findMany({
        select: {
            nameLower:    true,
            dynastyValue: true,
            redraftValue: true,
            team:         true,
            age:          true,
            trend30Day:   true,
        },
    });

    const map: Record<string, {
        dynasty:   number;
        redraft:   number;
        team:      string | null;
        age:       number | null;
        trend:     number | null;
    }> = {};

    for (const r of rows) {
        map[r.nameLower] = {
            dynasty: normalise(r.dynastyValue),
            redraft: normalise(r.redraftValue),
            team:    r.team,
            age:     r.age ? Math.round(r.age) : null,
            trend:   r.trend30Day,
        };
    }

    return Response.json(map, {
        headers: {
            // Cache for 1 hour — FC updates daily, no need to hit DB on every page load
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}
