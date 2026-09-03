import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAge, isPlausiblyActivePlayer } from '@/lib/calculateAge';
import type { Player } from '@/lib/trade-engine';
import { checkSearchLimit, getClientIp } from '@/lib/ratelimit';
import { normalizePlayerName } from '@/lib/playerName';
import { computePlayerBaseValue } from '@/lib/player-universe';
import { resolveProductionSignals } from '@/lib/rankings/productionSignals';
import { computeRealPoints, STANDARD_SCORING } from '@/lib/rankings/leagueScoringPoints';

const VALUE_CAP = 9999;
function normaliseFc(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / VALUE_CAP) * 100)));
}

// Real per-league context, passed by the Trade Evaluator's search box so a
// player's value here matches what they'll show once actually added to a
// trade side. Without this, the search preview used Math.max(dynastyValue,
// redraftValue) with no superflex or real scoring-settings awareness at
// all — a real bug: it silently ignored superflex format and showed an
// inflated value relative to the correct computePlayerBaseValue() used
// everywhere else (confirmed live on a real league: 78.4 vs the correct
// 65.3 for the same player, same real settings).
function parseLeagueContext(params: URLSearchParams) {
    const leagueType  = params.get('leagueType') === 'Redraft' ? 'Redraft' as const : 'Dynasty' as const;
    const superflex    = params.get('superflex') === '1';
    const pprParam      = params.get('ppr');
    const ppr: 0 | 0.5 | 1 = pprParam === '0' ? 0 : pprParam === '0.5' ? 0.5 : 1;
    const leagueSize    = Number(params.get('leagueSize') ?? 12) || 12;
    const passTd        = params.get('passTd')     != null ? Number(params.get('passTd'))     : 4;
    const bonusRecTe    = params.get('bonusRecTe') != null ? Number(params.get('bonusRecTe')) : 0;
    const rushAtt       = params.get('rushAtt')    != null ? Number(params.get('rushAtt'))    : 0;
    return { leagueType, superflex, ppr, leagueSize, passTd, bonusRecTe, rushAtt };
}

// Default baseValues for unranked / non-skill-position players
const DEPTH_BASE: Record<string, number> = {
    QB:  22, RB:  18, WR:  18, TE:  14,
    K:    8, DEF:  8,
};

// Same conservative season-point ceilings rookie-opportunity-sync already
// uses to normalise projected production into a 0-1 ratio — reused here so
// an unpriced offensive player (no FantasyCalc match, most commonly a
// rookie) gets a value shaped by their real production/projection instead
// of the flat DEPTH_BASE default every unpriced player at a position used
// to land on identically. DEPTH_BASE itself becomes the ratio=0.5 midpoint;
// a player with real production at or above the position cap scales up to
// 1.6x it, a player with none scales down to 0.4x it. Deliberately capped
// below what a FantasyCalc-priced veteran at the same production level
// would show — there's no market consensus for these players, so this
// stays conservative rather than guessing they're worth as much.
const PROJ_CAPS: Record<string, number> = {
    QB: 280, RB: 160, WR: 160, TE: 120,
};

function computeUnpricedOffenseValue(
    position: string,
    signal: { statsPerGame: Record<string, number>; gamesPlayed: number } | undefined,
): number {
    const base = DEPTH_BASE[position] ?? 10;
    const cap  = PROJ_CAPS[position];
    if (!cap) return base; // K/DEF etc — no real-production scaling here, defenseValues covers those client-side
    const seasonPoints = signal ? computeRealPoints(signal.statsPerGame, STANDARD_SCORING) * signal.gamesPlayed : 0;
    const ratio = Math.min(1, Math.max(0, seasonPoints / cap));
    return Math.round(base * (0.4 + 1.2 * ratio) * 10) / 10;
}

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
    const leagueCtx = parseLeagueContext(request.nextUrl.searchParams);

    // 1. Pull all DB matches (cast wide net, sort by relevance after)
    const [dbMatches, fcRows] = await Promise.all([
        prisma.sleeperPlayer.findMany({
            where: {
                OR: [{ active: true }, { team: { not: 'FA' } }],
                fullName: { contains: q, mode: 'insensitive' },
            },
            select: {
                playerId: true, fullName: true, position: true, team: true, birthDate: true, age: true,
                depthChartOrder: true, yearsExp: true,
            },
            take: 60, // extra headroom — stale-record filtering below may drop a few before the take:12 cap
        }),
        prisma.fantasyCalcValue.findMany({
            where: { nameLower: { contains: ql } },
            select: { nameLower: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, sleeperPlayerId: true },
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
    const byPlayerId      = new Map<string, FcRow>();
    for (const r of fcRows) {
        const normd = normalizePlayerName(r.nameLower);
        byNamePos.set(`${r.nameLower}|${r.position}`, r);
        byNormNamePos.set(`${normd}|${r.position}`, r);
        byNameCount.set(r.nameLower, (byNameCount.get(r.nameLower) ?? 0) + 1);
        byName.set(r.nameLower, r);
        byNormNameCount.set(normd, (byNormNameCount.get(normd) ?? 0) + 1);
        byNormName.set(normd, r);
        if (r.sleeperPlayerId) byPlayerId.set(r.sleeperPlayerId, r);
    }
    function resolveFc(nameLower: string, position: string): FcRow | undefined {
        const normd = normalizePlayerName(nameLower);
        return byNamePos.get(`${nameLower}|${position}`)
            ?? byNormNamePos.get(`${normd}|${position}`)
            ?? (byNameCount.get(nameLower) === 1 ? byName.get(nameLower) : undefined)
            ?? (byNormNameCount.get(normd) === 1 ? byNormName.get(normd) : undefined);
    }
    function resolveFcForSleeperPlayer(p: { playerId: string; fullName: string; position: string }): FcRow | undefined {
        return byPlayerId.get(p.playerId)
            ?? resolveFc(p.fullName.toLowerCase(), p.position);
    }

    // active:true / team!=FA alone miss long-retired players Sleeper's feed
    // still marks as rosterable (see feedback_stale_sleeper_player_data,
    // feedback_mock_draft_stale_rookie_pool) — a trade search for a retired
    // player's name shouldn't offer them as a real, tradeable option.
    const activeMatches = dbMatches.filter(p => !p.birthDate || isPlausiblyActivePlayer({
        team: p.team, age: calculateAge(p.birthDate) ?? p.age,
        depthChartOrder: p.depthChartOrder, yearsExp: p.yearsExp,
    }));

    // 2. Real per-game production for anyone with no FantasyCalc match —
    // batched once up front, only for the players that'll actually need it.
    const unpriced = activeMatches.filter(p => resolveFcForSleeperPlayer(p) === undefined && PROJ_CAPS[p.position]);
    const productionSignals = unpriced.length > 0
        ? await resolveProductionSignals(unpriced.map(p => p.playerId))
        : new Map<string, { statsPerGame: Record<string, number>; gamesPlayed: number }>();

    // 3. Merge: real per-league value (superflex + scoring settings aware,
    // same computePlayerBaseValue() the rest of the app uses) wins; fall
    // back to real-production-scaled depth default when FantasyCalc has no
    // match (see computeUnpricedOffenseValue above).
    const merged: Player[] = activeMatches.map((p, i) => {
        const fcRow  = resolveFcForSleeperPlayer(p);
        const baseValue = fcRow !== undefined
            ? computePlayerBaseValue({
                dynasty:   normaliseFc(fcRow.dynastyValue),
                dynastySf: normaliseFc(fcRow.dynastyValueSf),
                redraft:   normaliseFc(fcRow.redraftValue),
                redraftSf: normaliseFc(fcRow.redraftValueSf),
            }, p.position, leagueCtx)
            : computeUnpricedOffenseValue(p.position, productionSignals.get(p.playerId));
        return {
            rank:            i + 1,
            id:              p.playerId, // needed client-side so IDP/K/DEF search results can be
                                          // overridden with their real defensive-engine value instead
                                          // of the generic DEPTH_BASE fallback above — FantasyCalc
                                          // doesn't cover IDP at all, so every one of them would
                                          // otherwise land on the exact same flat baseValue.
            name:            p.fullName,
            position:        p.position,
            team:            p.team,
            age:             calculateAge(p.birthDate) ?? p.age ?? 0,
            baseValue,
            birthDate:       p.birthDate ?? null,
            playerImageUrl:  `https://sleepercdn.com/content/nfl/players/${p.playerId}.jpg`,
            image:           `https://sleepercdn.com/content/nfl/players/${p.playerId}.jpg`,
        };
    });

    // 4. Sort by name relevance, then higher baseValue first
    merged.sort((a, b) => {
        const ra = relevanceScore(a.name, ql);
        const rb = relevanceScore(b.name, ql);
        if (ra !== rb) return ra - rb;
        return b.baseValue - a.baseValue;
    });

    return Response.json(merged.slice(0, 12));
}
