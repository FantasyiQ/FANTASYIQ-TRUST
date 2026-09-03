import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { UniversePlayer, UniverseResponse } from '@/lib/player-universe';
import { calculateAge } from '@/lib/calculateAge';
import { checkPublicLimit, getClientIp } from '@/lib/ratelimit';
import { normalizePlayerName as normalizeName } from '@/lib/playerName';
import { resolveProductionSignals } from '@/lib/rankings/productionSignals';

const VALUE_CAP = 9999;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / VALUE_CAP) * 100)));
}


// Returns the full dynamic player universe: all ranked skill-position players
// merged with live Sleeper team/injury/age data, sorted by dynasty value desc.
export async function GET(request: NextRequest): Promise<Response> {
    const rl = await checkPublicLimit(getClientIp(request));
    if (rl.limited) return rl.response;

    // statsPerGame is league-agnostic (real per-player production, not adjusted
    // for any league's scoring) — safe to include in this shared, cached
    // response. Per-league perfFactor is computed at the point of use.
    const [fcRows, sleeperPlayers, latestSync] = await Promise.all([
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
                sleeperPlayerId: true,
            },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true, position: { in: ['QB', 'RB', 'WR', 'TE'] } },
            select: { playerId: true, fullName: true, team: true, injuryStatus: true, birthDate: true, age: true, position: true },
        }),
        // Latest sync time — max updatedAt across all rows
        prisma.fantasyCalcValue.findFirst({
            orderBy: { updatedAt: 'desc' },
            select:  { updatedAt: true },
        }),
    ]);

    // Real production signal per player: this season's real stats if any
    // games have been played, else this season's real projection (reflects
    // this year's actual team/role/health, not a full-year-stale prior
    // season), else last season's real stats as a final fallback.
    const statsByPlayerId = await resolveProductionSignals(sleeperPlayers.map(p => p.playerId));

    // Some real players share an exact fullName (e.g. two "Justin Jefferson"s —
    // WR/MIN and LB/CLE). Resolve by name+position first (exact, then normalized
    // name); only fall back to a bare name match when that name is unambiguous, so
    // we never silently attach one player's team/age/id onto a different player's row.
    type SleeperRow = typeof sleeperPlayers[number];
    const byNamePos     = new Map<string, SleeperRow>();
    const byNormNamePos = new Map<string, SleeperRow>();
    const byNameCount     = new Map<string, number>();
    const byName          = new Map<string, SleeperRow>();
    const byNormNameCount = new Map<string, number>();
    const byNormName      = new Map<string, SleeperRow>();
    const byPlayerId       = new Map<string, SleeperRow>();

    for (const p of sleeperPlayers) {
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        byNamePos.set(`${exact}|${p.position}`, p);
        byNormNamePos.set(`${normd}|${p.position}`, p);
        byNameCount.set(exact, (byNameCount.get(exact) ?? 0) + 1);
        byName.set(exact, p);
        byNormNameCount.set(normd, (byNormNameCount.get(normd) ?? 0) + 1);
        byNormName.set(normd, p);
        byPlayerId.set(p.playerId, p);
    }
    function resolveSleeper(nameLower: string, position: string): SleeperRow | undefined {
        const normd = normalizeName(nameLower);
        return byNamePos.get(`${nameLower}|${position}`)
            ?? byNormNamePos.get(`${normd}|${position}`)
            ?? (byNameCount.get(nameLower) === 1 ? byName.get(nameLower) : undefined)
            ?? (byNormNameCount.get(normd) === 1 ? byNormName.get(normd) : undefined);
    }
    // Prefer the stored Sleeper match from sync time — it's set from a richer,
    // curated cross-reference (handles suffixes like "Kenneth Walker III" that
    // FantasyCalc includes but Sleeper's own fullName omits). Only fall back to
    // live name matching when no stored id exists (e.g. older/unsynced rows).
    function resolveSleeperForFcRow(row: { nameLower: string; position: string; sleeperPlayerId: string | null }): SleeperRow | undefined {
        return (row.sleeperPlayerId ? byPlayerId.get(row.sleeperPlayerId) : undefined)
            ?? resolveSleeper(row.nameLower, row.position);
    }

    const players: UniversePlayer[] = fcRows
        .filter(r => SKILL_POSITIONS.has(r.position))
        .map(r => {
            const sleeper = resolveSleeperForFcRow(r) ?? null;

            const rawTeam = sleeper?.team ?? null;
            const team    = (rawTeam && rawTeam !== 'FA') ? rawTeam : null;
            const age     = calculateAge(sleeper?.birthDate) ?? sleeper?.age ?? (r.age ? Math.round(r.age) : null);
            const stats   = sleeper?.playerId ? statsByPlayerId.get(sleeper.playerId) : undefined;

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
                statsPerGame:    stats?.statsPerGame ?? null,
                gamesPlayed:     stats?.gamesPlayed ?? null,
            };
        })
        .sort((a, b) => b.dynasty - a.dynasty || a.name.localeCompare(b.name));

    const body: UniverseResponse = {
        meta: {
            generatedAt: new Date().toISOString(),
            valueSyncedAt: latestSync?.updatedAt.toISOString() ?? null,
            playerCount: players.length,
        },
        players,
    };

    return Response.json(body, {
        headers: {
            // 5-min cache — dynasty data and Sleeper both sync daily
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
    });
}
