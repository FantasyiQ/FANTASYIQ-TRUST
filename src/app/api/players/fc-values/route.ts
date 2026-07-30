import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkPublicLimit, getClientIp } from '@/lib/ratelimit';
import { normalizePlayerName as normalizeName } from '@/lib/playerName';

// Normalise raw value (0–9999) to our 0–100 DTV scale.
const VALUE_CAP = 9999;

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / VALUE_CAP) * 100)));
}


// Returns a map of lowercase player name → { dynasty, redraft, team, age, trend, injuryStatus }
// Used by TradeEvaluator to overlay live dynasty values onto hardcoded baseValues.
export async function GET(request: NextRequest): Promise<Response> {
    const rl = await checkPublicLimit(getClientIp(request));
    if (rl.limited) return rl.response;
    const [rows, sleeperPlayers] = await Promise.all([
        prisma.fantasyCalcValue.findMany({
            select: {
                nameLower:      true,
                position:       true,
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
            select: { fullName: true, injuryStatus: true, team: true, position: true },
        }),
    ]);

    // Build Sleeper lookup keyed by name+position (exact + normalized). Some real
    // players share an exact fullName (e.g. two "Justin Jefferson"s — WR/MIN and
    // LB/CLE); only fall back to a bare name match when that name is unambiguous.
    type SleeperInfo = { injuryStatus: string | null; team: string | null };
    const byNamePos     = new Map<string, SleeperInfo>();
    const byNormNamePos = new Map<string, SleeperInfo>();
    const byNameCount     = new Map<string, number>();
    const byName          = new Map<string, SleeperInfo>();
    const byNormNameCount = new Map<string, number>();
    const byNormName      = new Map<string, SleeperInfo>();

    for (const p of sleeperPlayers) {
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        // team: 'FA' means free agent — treat as null for display
        const team = (p.team && p.team !== 'FA') ? p.team : null;
        const val: SleeperInfo = { injuryStatus: p.injuryStatus, team };
        byNamePos.set(`${exact}|${p.position}`, val);
        byNormNamePos.set(`${normd}|${p.position}`, val);
        byNameCount.set(exact, (byNameCount.get(exact) ?? 0) + 1);
        byName.set(exact, val);
        byNormNameCount.set(normd, (byNormNameCount.get(normd) ?? 0) + 1);
        byNormName.set(normd, val);
    }
    function resolveSleeper(nameLower: string, position: string): SleeperInfo | undefined {
        const normd = normalizeName(nameLower);
        return byNamePos.get(`${nameLower}|${position}`)
            ?? byNormNamePos.get(`${normd}|${position}`)
            ?? (byNameCount.get(nameLower) === 1 ? byName.get(nameLower) : undefined)
            ?? (byNormNameCount.get(normd) === 1 ? byNormName.get(normd) : undefined);
    }

    // Build set of normalized names for the warn pass below
    const fcNormalized = new Set(rows.map(r => normalizeName(r.nameLower)));

    // Warn about Sleeper players with injuries that have no dynasty value counterpart
    for (const p of sleeperPlayers) {
        if (!p.injuryStatus) continue;
        const normd = normalizeName(p.fullName);
        if (!fcNormalized.has(normd)) {
            console.warn(`[DTV] No dynasty value match for: ${p.fullName} (normalized: ${normd})`);
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
        const sl    = resolveSleeper(r.nameLower, r.position);

        const injuryStatus = sl?.injuryStatus ?? null;
        const sleeperTeam  = sl?.team ?? null;

        map[exact] = {
            dynasty:      normalise(r.dynastyValue),
            dynastySf:    normalise(r.dynastyValueSf),
            redraft:      normalise(r.redraftValue),
            redraftSf:    normalise(r.redraftValueSf),
            team:         sleeperTeam ?? r.team,   // Sleeper authoritative, dynasty data fallback
            age:          r.age ? Math.round(r.age) : null,
            trend:        r.trend30Day,
            injuryStatus,
        };
    }

    return Response.json(map, {
        headers: {
            // Cache for 5 min; data syncs daily but we want fresh values after each sync
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
    });
}
