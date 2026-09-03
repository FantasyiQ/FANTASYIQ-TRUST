import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizePlayerName as normalizeName } from '@/lib/playerName';
import { calculateAge } from '@/lib/calculateAge';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';
import { resolveProductionSignals } from '@/lib/rankings/productionSignals';
import {
    computeRealPoints, computePerfFactor,
    computePositionScoringFactor, combineScoringFactors, STANDARD_SCORING,
} from '@/lib/rankings/leagueScoringPoints';

const VALUE_CAP = 9999;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / VALUE_CAP) * 100)));
}


function buildLeagueSettings(
    rosterPositions: string[],
    scoringSettings: Record<string, number> | null,
): LeagueSettings {
    const ss  = scoringSettings ?? {};
    let qbSlots = 0, rbSlots = 0, wrSlots = 0, teSlots = 0, flexSlots = 0, sfSlots = 0;
    for (const pos of rosterPositions) {
        if (pos === 'QB')         qbSlots++;
        else if (pos === 'RB')    rbSlots++;
        else if (pos === 'WR')    wrSlots++;
        else if (pos === 'TE')    teSlots++;
        else if (pos === 'FLEX' || pos === 'REC_FLEX') flexSlots++;
        else if (pos === 'SUPER_FLEX') sfSlots++;
    }
    return {
        passTd:     ss.pass_td      ?? DEFAULT_LEAGUE_SETTINGS.passTd,
        bonusRecTe: ss.bonus_rec_te ?? DEFAULT_LEAGUE_SETTINGS.bonusRecTe,
        rushAtt:    ss.rush_att     ?? DEFAULT_LEAGUE_SETTINGS.rushAtt,
        qbSlots:    qbSlots  || DEFAULT_LEAGUE_SETTINGS.qbSlots,
        rbSlots:    rbSlots  || DEFAULT_LEAGUE_SETTINGS.rbSlots,
        wrSlots:    wrSlots  || DEFAULT_LEAGUE_SETTINGS.wrSlots,
        teSlots:    teSlots  || DEFAULT_LEAGUE_SETTINGS.teSlots,
        flexSlots,
        sfSlots,
    };
}

function scoringTypeToPpr(scoringType: string | null): 0 | 0.5 | 1 {
    if (scoringType === 'ppr')      return 1;
    if (scoringType === 'half_ppr') return 0.5;
    return 0;
}

export interface RankedPlayer {
    rank:         number;
    name:         string;
    position:     string;
    team:         string | null;
    age:          number | null;
    finalDtv:     number;
    tier:         string;
    dynasty:      number;
    redraft:      number;
    injuryStatus: string | null;
    trend:        number | null;
}

export interface LeagueRankingsResponse {
    leagueId:        string;
    leagueName:      string;
    leagueType:      string;
    scoringType:     string | null;
    superflex:       boolean;
    totalRosters:    number;
    generatedAt:     string;
    playerCount:     number;
    players:         RankedPlayer[];
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;

    // Find any League record with this Sleeper leagueId (any user's — same league, same settings)
    const league = await prisma.league.findFirst({
        where: { leagueId },
        select: {
            leagueName:      true,
            leagueType:      true,
            scoringType:     true,
            scoringSettings: true,
            rosterPositions: true,
            totalRosters:    true,
        },
    });

    if (!league) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }

    const leagueType   = (league.leagueType as LeagueType) ?? 'Redraft';
    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
    const leagueSettings = buildLeagueSettings(league.rosterPositions, scoringSettings);
    const ppr       = scoringTypeToPpr(league.scoringType);
    const superflex = leagueSettings.sfSlots > 0;
    const leagueSize = league.totalRosters;

    // Fetch universe data directly from DB (same logic as /api/players/universe)
    const [fcRows, sleeperPlayers] = await Promise.all([
        prisma.fantasyCalcValue.findMany({
            where: {
                position: { in: ['QB', 'RB', 'WR', 'TE'] },
                OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }],
            },
            select: { playerName: true, nameLower: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, age: true, trend30Day: true, sleeperPlayerId: true },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true, position: { in: ['QB', 'RB', 'WR', 'TE'] } },
            select: { playerId: true, fullName: true, team: true, injuryStatus: true, birthDate: true, age: true, position: true },
        }),
    ]);

    // League Scoring Points Engine: real per-league scoring adjustment,
    // sourced from whichever real signal each player actually has — this
    // season's real stats, else this season's real projection (reflects
    // this year's actual team/role/health), else last season's real stats
    // as a final fallback. See productionSignals.ts.
    const statsByPlayerId = await resolveProductionSignals(sleeperPlayers.map(p => p.playerId));

    // Some real players share an exact fullName (e.g. two "Justin Jefferson"s —
    // WR/MIN and LB/CLE). Resolve by name+position first (exact, then normalized
    // name); only fall back to a bare name match when that name is unambiguous, so
    // we never silently attach one player's team/age onto a different player's row.
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
    // Prefer the canonical ID resolved once at FantasyCalc sync time
    // (src/app/api/cron/fantasycalc-sync/route.ts) — a plain lookup, no
    // per-row name matching. Falls back to name resolution only for rows
    // synced before that existed, or that never had a Sleeper match.
    function resolveSleeperForFcRow(row: { nameLower: string; position: string; sleeperPlayerId: string | null }): SleeperRow | undefined {
        return (row.sleeperPlayerId ? byPlayerId.get(row.sleeperPlayerId) : undefined)
            ?? resolveSleeper(row.nameLower, row.position);
    }

    // Pass 1: resolve real per-game production under this league's scoring,
    // and accumulate positional totals (league-real and standard-baseline) —
    // perfFactor/positionScoringFactor can't be computed until every player in
    // a position group has been seen.
    type FcRow = (typeof fcRows)[number];
    type Pending = {
        r: FcRow; u: UniversePlayer;
        realPtsPerGame: number; standardPtsPerGame: number;
        statsPerGame: Record<string, number> | null; gamesPlayed: number | null;
    };
    const pending: Pending[] = [];
    const posPtsSum = new Map<string, number>(), posPtsCount = new Map<string, number>(), posStdPtsSum = new Map<string, number>();

    for (const r of fcRows) {
        if (!SKILL_POSITIONS.has(r.position)) continue;
        const sleeper = resolveSleeperForFcRow(r) ?? null;
        const rawTeam = sleeper?.team ?? null;
        const stats           = sleeper?.playerId ? statsByPlayerId.get(sleeper.playerId) : undefined;
        const statsPerGame     = stats?.statsPerGame ?? null;
        const gamesPlayed      = stats?.gamesPlayed ?? null;
        const realPtsPerGame     = statsPerGame ? computeRealPoints(statsPerGame, scoringSettings) : 0;
        const standardPtsPerGame = statsPerGame ? computeRealPoints(statsPerGame, STANDARD_SCORING) : 0;

        if (statsPerGame && gamesPlayed) {
            posPtsSum.set(r.position, (posPtsSum.get(r.position) ?? 0) + realPtsPerGame);
            posPtsCount.set(r.position, (posPtsCount.get(r.position) ?? 0) + 1);
            posStdPtsSum.set(r.position, (posStdPtsSum.get(r.position) ?? 0) + standardPtsPerGame);
        }

        const u: UniversePlayer = {
            name:            r.playerName,
            position:        r.position,
            team:            (rawTeam && rawTeam !== 'FA') ? rawTeam : null,
            age:             calculateAge(sleeper?.birthDate) ?? sleeper?.age ?? (r.age ? Math.round(r.age) : null),
            dynasty:         normalise(r.dynastyValue),
            dynastySf:       normalise(r.dynastyValueSf),
            redraft:         normalise(r.redraftValue),
            redraftSf:       normalise(r.redraftValueSf),
            trend:           r.trend30Day ?? null,
            injuryStatus:    sleeper?.injuryStatus ?? null,
            birthDate:       null,
            playerImageUrl:  null,
            statsPerGame,
            gamesPlayed,
        };
        pending.push({ r, u, realPtsPerGame, standardPtsPerGame, statsPerGame, gamesPlayed });
    }

    const posAvgPtsPerGame = new Map<string, number>();
    const posStdAvgPtsPerGame = new Map<string, number>();
    for (const [pos, sum] of posPtsSum) posAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
    for (const [pos, sum] of posStdPtsSum) posStdAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
    const posScoringFactor = new Map<string, number>();
    for (const pos of posAvgPtsPerGame.keys()) {
        posScoringFactor.set(pos, computePositionScoringFactor(posAvgPtsPerGame.get(pos) ?? 0, posStdAvgPtsPerGame.get(pos) ?? 0));
    }

    // Pass 2: compute finalDtv for each player under this league's settings
    const ranked = pending
        .map(({ r, u, realPtsPerGame, statsPerGame, gamesPlayed }, i) => {
            const individualFactor = statsPerGame && gamesPlayed
                ? computePerfFactor(realPtsPerGame, posAvgPtsPerGame.get(r.position) ?? 0, gamesPlayed)
                : 1.0;
            const positionFactor = posScoringFactor.get(r.position) ?? 1.0;
            const perfFactor     = combineScoringFactors(individualFactor, positionFactor);

            const baseValue = computePlayerBaseValue(u, u.position, {
                leagueType, superflex, ppr, leagueSize,
                passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe, rushAtt: leagueSettings.rushAtt,
            });
            const p: Player = {
                rank: i + 1, name: u.name, position: u.position,
                team: u.team ?? 'FA', age: u.age ?? 0,
                baseValue, injuryStatus: u.injuryStatus, perfFactor,
            };
            const dtv = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
            return { u, dtv };
        })
        .sort((a, b) => b.dtv.finalDtv - a.dtv.finalDtv || a.u.name.localeCompare(b.u.name))
        .map(({ u, dtv }, i): RankedPlayer => ({
            rank:         i + 1,
            name:         u.name,
            position:     u.position,
            team:         u.team,
            age:          u.age,
            finalDtv:     dtv.finalDtv,
            tier:         dtv.tier,
            dynasty:      u.dynasty,
            redraft:      u.redraft,
            injuryStatus: u.injuryStatus,
            trend:        u.trend,
        }));

    const body: LeagueRankingsResponse = {
        leagueId,
        leagueName:   league.leagueName,
        leagueType,
        scoringType:  league.scoringType,
        superflex,
        totalRosters: leagueSize,
        generatedAt:  new Date().toISOString(),
        playerCount:  ranked.length,
        players:      ranked,
    };

    return Response.json(body, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
}
