import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAge } from '@/lib/calculateAge';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';

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
    const leagueSettings = buildLeagueSettings(
        league.rosterPositions,
        (league.scoringSettings as Record<string, number> | null),
    );
    const ppr       = scoringTypeToPpr(league.scoringType);
    const superflex = leagueSettings.sfSlots > 0;
    const leagueSize = league.totalRosters;

    // Fetch universe data directly from DB (same logic as /api/players/universe)
    const [ktcRows, sleeperPlayers] = await Promise.all([
        prisma.fantasyCalcValue.findMany({
            where: {
                position: { in: ['QB', 'RB', 'WR', 'TE'] },
                OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }],
            },
            select: { playerName: true, nameLower: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, age: true, trend30Day: true },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true, position: { in: ['QB', 'RB', 'WR', 'TE'] } },
            select: { fullName: true, team: true, injuryStatus: true, birthDate: true, age: true },
        }),
    ]);

    const sleeperExact      = new Map<string, typeof sleeperPlayers[number]>();
    const sleeperNormalized = new Map<string, typeof sleeperPlayers[number]>();
    for (const p of sleeperPlayers) {
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        if (!sleeperExact.has(exact))      sleeperExact.set(exact, p);
        if (!sleeperNormalized.has(normd)) sleeperNormalized.set(normd, p);
    }

    const universePlayers: UniversePlayer[] = ktcRows
        .filter(r => SKILL_POSITIONS.has(r.position))
        .map(r => {
            const sleeper = sleeperExact.get(r.nameLower) ?? sleeperNormalized.get(normalizeName(r.nameLower)) ?? null;
            const rawTeam = sleeper?.team ?? null;
            return {
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
            };
        });

    // Compute finalDtv for each player under this league's settings
    const ranked = universePlayers
        .map((u, i) => {
            const baseValue = computePlayerBaseValue(u, u.position, {
                leagueType, superflex, ppr, leagueSize,
                passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe,
            });
            const p: Player = {
                rank: i + 1, name: u.name, position: u.position,
                team: u.team ?? 'FA', age: u.age ?? 0,
                baseValue, injuryStatus: u.injuryStatus,
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
