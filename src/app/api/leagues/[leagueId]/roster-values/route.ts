import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getLeagueUsers, getPlayers } from '@/lib/sleeper';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RosterPlayer {
    playerId:     string;
    name:         string;
    position:     string;
    team:         string | null;
    finalDtv:     number;
    dynasty:      number;    // raw normalised 0–100
    redraft:      number;
    delta:        number | null;   // dynasty delta from yesterday's snapshot
    injuryStatus: string | null;
    isNew:        boolean;
    isTraded:     boolean;
}

export interface PositionalBreakdown {
    QB:    number;
    RB:    number;
    WR:    number;
    TE:    number;
    Bench: number;
}

export type RosterTier = 'Elite' | 'Contender' | 'Competitive' | 'Rebuilding';

export interface RosterTeam {
    rosterId:            number;
    ownerId:             string | null;
    displayName:         string;
    rank:                number;
    tier:                RosterTier;
    totalRosterValue:    number;
    positionalBreakdown: PositionalBreakdown;
    players:             RosterPlayer[];
}

export interface RosterValuesResponse {
    meta: {
        generatedAt:     string;
        leagueId:        string;
        leagueName:      string;
        leagueType:      string;
        scoringType:     string | null;
        superflex:       boolean;
        teamCount:       number;
        scoringSettings: Record<string, number>;
        // Tiers are league-relative (percentile), not absolute DTV thresholds.
        tierModel:       'percentile';
        tierBands: {
            Elite:       string;
            Contender:   string;
            Competitive: string;
            Rebuilding:  string;
        };
    };
    teams: RosterTeam[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
    const ss = scoringSettings ?? {};
    let qbSlots = 0, rbSlots = 0, wrSlots = 0, teSlots = 0, flexSlots = 0, sfSlots = 0;
    for (const pos of rosterPositions) {
        if (pos === 'QB')                   qbSlots++;
        else if (pos === 'RB')              rbSlots++;
        else if (pos === 'WR')              wrSlots++;
        else if (pos === 'TE')              teSlots++;
        else if (pos === 'FLEX' || pos === 'REC_FLEX') flexSlots++;
        else if (pos === 'SUPER_FLEX')      sfSlots++;
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

// Tiers are league-relative: each team's rank within the league determines its
// tier, so the model is format-agnostic and scales to any league size.
// Percentile: 0.0 = top of league, 1.0 = bottom of league.
function buildTierClassifier(sortedValuesDesc: number[]): (value: number) => RosterTier {
    const n = sortedValuesDesc.length;
    return (value: number): RosterTier => {
        // Count how many teams score strictly above this value (higher = better)
        const rank = sortedValuesDesc.filter(v => v > value).length;
        const percentile = n > 1 ? rank / n : 0;
        if (percentile <= 0.20) return 'Elite';
        if (percentile <= 0.50) return 'Contender';
        if (percentile <= 0.80) return 'Competitive';
        return 'Rebuilding';
    };
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;

    // 1. Load league config from DB (settings stored by sleeper-sync cron)
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

    const leagueType     = (league.leagueType as LeagueType) ?? 'Redraft';
    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
    const leagueSettings  = buildLeagueSettings(league.rosterPositions, scoringSettings);
    const ppr             = scoringTypeToPpr(league.scoringType);
    const superflex       = leagueSettings.sfSlots > 0;
    const leagueSize      = league.totalRosters;

    // 2. Fetch Sleeper rosters + members + KTC universe in parallel
    const [rosters, members, ktcRows, sleeperAllPlayers, latestSnapshot] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        prisma.fantasyCalcValue.findMany({
            where: { OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }] },
            select: {
                playerName: true, nameLower: true, position: true,
                dynastyValue: true, dynastyValueSf: true,
                redraftValue: true, redraftValueSf: true,
            },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true },
            select: { playerId: true, fullName: true, team: true, injuryStatus: true, age: true },
        }),
        // Latest snapshot for delta computation
        prisma.fantasyCalcSnapshot.findFirst({
            orderBy: { takenAt: 'desc' },
            select:  { takenAt: true },
        }),
    ]);

    // 3. Resolve all player IDs appearing on any roster
    const allPlayerIds = [...new Set(
        rosters.flatMap(r => r.players ?? [])
    )];
    const playerById = await getPlayers(allPlayerIds);

    // 4. Build Sleeper lookup by fullName (exact + normalized)
    type SleeperInfo = { team: string; injuryStatus: string | null; age: number | null };
    const sleeperExact      = new Map<string, SleeperInfo>();
    const sleeperNormalized = new Map<string, SleeperInfo>();
    for (const p of sleeperAllPlayers) {
        const val = { team: p.team, injuryStatus: p.injuryStatus, age: p.age };
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        if (!sleeperExact.has(exact))      sleeperExact.set(exact, val);
        if (!sleeperNormalized.has(normd)) sleeperNormalized.set(normd, val);
    }

    // 5. Build DTV map keyed by lowercase name
    const dtvByName = new Map<string, { universe: UniversePlayer; finalDtv: number }>();
    for (const r of ktcRows) {
        const exact  = r.nameLower;
        const normd  = normalizeName(r.nameLower);
        const sl     = sleeperExact.get(exact) ?? sleeperNormalized.get(normd) ?? null;
        const rawTeam = sl?.team ?? null;
        const team   = (rawTeam && rawTeam !== 'FA') ? rawTeam : null;
        const age    = sl?.age ?? 0;

        const u: UniversePlayer = {
            name:         r.playerName,
            position:     r.position,
            team,
            age,
            dynasty:      normalise(r.dynastyValue),
            dynastySf:    normalise(r.dynastyValueSf),
            redraft:      normalise(r.redraftValue),
            redraftSf:    normalise(r.redraftValueSf),
            trend:        null,
            injuryStatus: sl?.injuryStatus ?? null,
        };
        const baseValue = SKILL_POSITIONS.has(r.position)
            ? computePlayerBaseValue(u, r.position, {
                leagueType, superflex, ppr, leagueSize,
                passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe,
              })
            : 0;

        const playerShell: Player = {
            rank: 0, name: r.playerName, position: r.position,
            team: team ?? 'FA', age, baseValue,
            injuryStatus: sl?.injuryStatus,
        };
        const dtv = SKILL_POSITIONS.has(r.position)
            ? calcDtv(playerShell, ppr, leagueType, undefined, leagueSettings)
            : { finalDtv: 0 };

        dtvByName.set(exact, { universe: u, finalDtv: dtv.finalDtv });
        // Also index by normalized name for suffix-mismatched lookups
        if (!dtvByName.has(normd)) dtvByName.set(normd, { universe: u, finalDtv: dtv.finalDtv });
    }

    // 6. Build delta + isNew lookup from latest snapshot
    type DeltaInfo = { dynastyDelta: number; prevTeam: string | null; isNew: boolean };
    const deltaByName = new Map<string, DeltaInfo>();
    if (latestSnapshot) {
        const batchStart = new Date(latestSnapshot.takenAt.getTime() - 60 * 1000);
        const snapRows = await prisma.fantasyCalcSnapshot.findMany({
            where: { takenAt: { gte: batchStart } },
            select: { nameLower: true, dynastyValue: true, team: true },
        });
        const snapMap = new Map(snapRows.map(s => [s.nameLower, s]));

        for (const [nameLower, { universe }] of dtvByName) {
            const snap = snapMap.get(nameLower);
            if (!snap) {
                deltaByName.set(nameLower, { dynastyDelta: 0, prevTeam: null, isNew: true });
            } else {
                const prevNorm = normalise(snap.dynastyValue);
                deltaByName.set(nameLower, {
                    dynastyDelta: universe.dynasty - prevNorm,
                    prevTeam:     snap.team ?? null,
                    isNew:        false,
                });
            }
        }
    }

    // 7. Build member display-name lookup keyed by user_id
    const memberMap = new Map(members.map(m => [m.user_id, m]));

    // 8. Build each team's roster value
    const teams: RosterTeam[] = rosters.map(roster => {
        const member      = roster.owner_id ? memberMap.get(roster.owner_id) : undefined;
        const displayName = member?.metadata?.team_name || member?.display_name || `Team ${roster.roster_id}`;

        const rosterPlayers: RosterPlayer[] = (roster.players ?? [])
            .map(pid => {
                const slim    = playerById[pid];
                if (!slim) return null;

                const nameLower = slim.full_name.toLowerCase();
                const normd     = normalizeName(slim.full_name);
                const entry     = dtvByName.get(nameLower) ?? dtvByName.get(normd) ?? null;
                const deltaInfo = deltaByName.get(nameLower) ?? deltaByName.get(normd) ?? null;

                const rawTeam  = slim.team && slim.team !== 'FA' ? slim.team : null;
                const isTraded = !!(deltaInfo && deltaInfo.prevTeam !== null && deltaInfo.prevTeam !== rawTeam);

                return {
                    playerId:     pid,
                    name:         slim.full_name,
                    position:     slim.position,
                    team:         rawTeam,
                    finalDtv:     entry?.finalDtv ?? 0,
                    dynasty:      entry?.universe.dynasty ?? 0,
                    redraft:      entry?.universe.redraft ?? 0,
                    delta:        deltaInfo?.dynastyDelta ?? null,
                    injuryStatus: entry?.universe.injuryStatus ?? null,
                    isNew:        deltaInfo?.isNew ?? false,
                    isTraded,
                } satisfies RosterPlayer;
            })
            .filter((p): p is RosterPlayer => p !== null)
            .sort((a, b) => b.finalDtv - a.finalDtv);

        // Positional breakdown — QB/RB/WR/TE by position; everything else → Bench
        const breakdown: PositionalBreakdown = { QB: 0, RB: 0, WR: 0, TE: 0, Bench: 0 };
        for (const p of rosterPlayers) {
            if (p.position === 'QB')      breakdown.QB    += p.finalDtv;
            else if (p.position === 'RB') breakdown.RB    += p.finalDtv;
            else if (p.position === 'WR') breakdown.WR    += p.finalDtv;
            else if (p.position === 'TE') breakdown.TE    += p.finalDtv;
            else                          breakdown.Bench += p.finalDtv;
        }
        // Round all values
        for (const k of Object.keys(breakdown) as (keyof PositionalBreakdown)[]) {
            breakdown[k] = Math.round(breakdown[k] * 10) / 10;
        }

        const totalRosterValue = Math.round(
            rosterPlayers.reduce((s, p) => s + p.finalDtv, 0) * 10
        ) / 10;

        return {
            rosterId:            roster.roster_id,
            ownerId:             roster.owner_id,
            displayName,
            rank:                0,            // assigned after sort
            tier:                'Rebuilding', // overwritten after sort
            totalRosterValue,
            positionalBreakdown: breakdown,
            players:             rosterPlayers,
        };
    });

    // 9. Sort by totalRosterValue desc, assign rank and percentile-based tiers.
    //    Tiers are league-relative so they automatically adapt to any DTV scale.
    teams.sort((a, b) => b.totalRosterValue - a.totalRosterValue);
    const sortedValues  = teams.map(t => t.totalRosterValue);
    const classifyTier  = buildTierClassifier(sortedValues);
    teams.forEach((t, i) => {
        t.rank = i + 1;
        t.tier = classifyTier(t.totalRosterValue);
    });

    const body: RosterValuesResponse = {
        meta: {
            generatedAt:     new Date().toISOString(),
            leagueId,
            leagueName:      league.leagueName,
            leagueType,
            scoringType:     league.scoringType,
            superflex,
            teamCount:       teams.length,
            scoringSettings,
            tierModel:       'percentile',
            tierBands: {
                Elite:       'Top 20%',
                Contender:   '20–50%',
                Competitive: '50–80%',
                Rebuilding:  'Bottom 20%',
            },
        },
        teams,
    };

    return Response.json(body, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
}
