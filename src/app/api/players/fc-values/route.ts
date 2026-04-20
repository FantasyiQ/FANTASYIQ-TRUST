import { prisma } from '@/lib/prisma';

// Normalise KTC raw value (0–9999) to our 0–100 DTV scale.
const KTC_CAP = 9999;

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / KTC_CAP) * 100)));
}

// Normalise a player name for cross-source matching.
// Strips name suffixes (Jr, Sr, II, III, IV, V) and periods so that
// "Kenneth Walker III" and "Kenneth Walker" map to the same key.
function normalizeName(name: string): string {
    return name
        .toLowerCase()
        // Strip trailing generational suffixes (whole-word match at end of string)
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')
        // Strip periods (e.g. "D.J." → "DJ", "T.J." → "TJ")
        .replace(/\./g, '')
        // Collapse extra whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

// Returns a map of lowercase player name → { dynasty, redraft, team, age, trend, injuryStatus }
// Used by TradeEvaluator to overlay live KTC values onto hardcoded baseValues.
export async function GET(): Promise<Response> {
    const [rows, sleeperPlayers] = await Promise.all([
        prisma.fantasyCalcValue.findMany({
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
        }),
        // Fetch all active Sleeper players — team updates daily from Sleeper API,
        // so it's authoritative for trades/signings. Also provides injury status.
        prisma.sleeperPlayer.findMany({
            where:  { active: true },
            select: { fullName: true, injuryStatus: true, team: true },
        }),
    ]);

    // Build injury + team lookups keyed by exact lowercase name AND normalized name.
    // Exact key wins if present; normalized key catches suffix/period mismatches.
    const injuryExact      = new Map<string, string | null>();
    const injuryNormalized = new Map<string, string | null>();
    const teamExact        = new Map<string, string | null>();
    const teamNormalized   = new Map<string, string | null>();

    for (const p of sleeperPlayers) {
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);

        if (p.injuryStatus != null) {
            injuryExact.set(exact, p.injuryStatus);
            if (!injuryNormalized.has(normd)) injuryNormalized.set(normd, p.injuryStatus);
        }

        // team: 'FA' means free agent — treat as null for display
        const team = (p.team && p.team !== 'FA') ? p.team : null;
        teamExact.set(exact, team);
        if (!teamNormalized.has(normd)) teamNormalized.set(normd, team);
    }

    // Build set of normalized KTC names for the warn pass below
    const ktcNormalized = new Set(rows.map(r => normalizeName(r.nameLower)));

    // Warn about Sleeper players with injuries that have no KTC counterpart
    for (const p of sleeperPlayers) {
        if (!p.injuryStatus) continue;
        const normd = normalizeName(p.fullName);
        if (!ktcNormalized.has(normd)) {
            console.warn(`[DTV] No KTC match for: ${p.fullName} (normalized: ${normd})`);
        }
    }

    const map: Record<string, {
        dynasty:       number;
        dynastySf:     number;
        redraft:       number;
        redraftSf:     number;
        team:          string | null;
        age:           number | null;
        trend:         number | null;
        injuryStatus:  string | null;
    }> = {};

    for (const r of rows) {
        const exact = r.nameLower;
        const normd = normalizeName(r.nameLower);

        const injuryStatus =
            injuryExact.get(exact) ??
            injuryNormalized.get(normd) ??
            null;

        const sleeperTeam = teamExact.get(exact) ?? teamNormalized.get(normd) ?? null;

        map[exact] = {
            dynasty:      normalise(r.dynastyValue),
            dynastySf:    normalise(r.dynastyValueSf),
            redraft:      normalise(r.redraftValue),
            redraftSf:    normalise(r.redraftValueSf),
            team:         sleeperTeam ?? r.team,   // Sleeper authoritative, KTC fallback
            age:          r.age ? Math.round(r.age) : null,
            trend:        r.trend30Day,
            injuryStatus,
        };
    }

    return Response.json(map, {
        headers: {
            // Cache for 5 min; KTC syncs daily but we want fresh values after each sync
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
    });
}
