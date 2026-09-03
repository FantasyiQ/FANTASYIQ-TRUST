import { type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requireLeaguePaidAccess } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { normalizePlayerName as normalizeName } from '@/lib/playerName';
import { calculateAge } from '@/lib/calculateAge';
import { getLeagueRosters, getLeagueUsers, getPlayers } from '@/lib/sleeper';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';
import {
    computeRealPoints, computePerfFactor,
    computePositionScoringFactor, combineScoringFactors, STANDARD_SCORING,
} from '@/lib/rankings/leagueScoringPoints';
import { resolveProductionSignals } from '@/lib/rankings/productionSignals';

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

const VALUE_CAP = 9999;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / VALUE_CAP) * 100)));
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

function aggregateTeam(rosterPlayers: RosterPlayer[]): { breakdown: PositionalBreakdown; totalRosterValue: number } {
    const breakdown: PositionalBreakdown = { QB: 0, RB: 0, WR: 0, TE: 0, Bench: 0 };
    for (const p of rosterPlayers) {
        if (p.position === 'QB')      breakdown.QB    += p.finalDtv;
        else if (p.position === 'RB') breakdown.RB    += p.finalDtv;
        else if (p.position === 'WR') breakdown.WR    += p.finalDtv;
        else if (p.position === 'TE') breakdown.TE    += p.finalDtv;
        else                          breakdown.Bench += p.finalDtv;
    }
    for (const k of Object.keys(breakdown) as (keyof PositionalBreakdown)[]) {
        breakdown[k] = Math.round(breakdown[k] * 10) / 10;
    }
    const totalRosterValue = Math.round(rosterPlayers.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
    return { breakdown, totalRosterValue };
}

// Real ESPN syncs (src/app/api/espn/sync/route.ts) persist each team's roster
// under standings[].players as { name, position, lineupSlot } — no stable
// per-player ID, so team/age/injuryStatus are resolved by name via the same
// resolveSleeper() lookup used for the fcRows/DTV pass above.
interface EspnStandingsPlayer {
    name: string;
    position: string;
}
interface EspnStandingsTeam {
    teamId: number;
    name: string;
    ownerId: string | null;
    ownerName: string | null;
    players?: EspnStandingsPlayer[];
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
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
            assignedPlanId:   true,
            assignedPlanType: true,
            platform:         true,
            standings:        true,
        },
    });
    if (!league) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }

    const deny = await requireLeaguePaidAccess(session.user.id, league.assignedPlanId, league.assignedPlanType);
    if (deny) return deny;

    const leagueType     = (league.leagueType as LeagueType) ?? 'Redraft';
    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
    const leagueSettings  = buildLeagueSettings(league.rosterPositions, scoringSettings);
    const ppr             = scoringTypeToPpr(league.scoringType);
    const superflex       = leagueSettings.sfSlots > 0;
    const leagueSize      = league.totalRosters;
    const isEspn           = league.platform === 'espn';

    // 2. Fetch dynasty universe (both platforms) + Sleeper rosters/members
    //    (Sleeper only — an ESPN leagueId isn't a valid Sleeper league, so
    //    skip these calls entirely rather than let them fail against it).
    const [rosters, members] = isEspn
        ? [[], []] as [Awaited<ReturnType<typeof getLeagueRosters>>, Awaited<ReturnType<typeof getLeagueUsers>>]
        : await Promise.all([getLeagueRosters(leagueId), getLeagueUsers(leagueId)]);

    const [fcRows, sleeperAllPlayers, latestSnapshot] = await Promise.all([
        prisma.fantasyCalcValue.findMany({
            where: { OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }] },
            select: {
                playerName: true, nameLower: true, position: true,
                dynastyValue: true, dynastyValueSf: true,
                redraftValue: true, redraftValueSf: true,
                sleeperPlayerId: true,
            },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true },
            select: { playerId: true, fullName: true, team: true, injuryStatus: true, birthDate: true, age: true, position: true },
        }),
        // Latest snapshot for delta computation
        prisma.fantasyCalcSnapshot.findFirst({
            orderBy: { takenAt: 'desc' },
            select:  { takenAt: true },
        }),
    ]);

    // League Scoring Points Engine: real per-league scoring adjustment,
    // sourced from whichever real signal each player actually has — this
    // season's real stats, else this season's real projection (reflects
    // this year's actual team/role/health), else last season's real stats
    // as a final fallback. See productionSignals.ts.
    const statsByPlayerId = await resolveProductionSignals(sleeperAllPlayers.map(p => p.playerId));

    // 3. Resolve all player IDs appearing on any roster (Sleeper only — ESPN
    //    rosters carry no Sleeper playerId, resolved by name instead below)
    const allPlayerIds = [...new Set(
        rosters.flatMap(r => r.players ?? [])
    )];
    const playerById = isEspn ? {} : await getPlayers(allPlayerIds);

    // 4. Build Sleeper lookup by name+position (exact + normalized). Some real
    // players share an exact fullName (e.g. two "Justin Jefferson"s — WR/MIN and
    // LB/CLE); only fall back to a bare name match when that name is unambiguous.
    type SleeperInfo = { playerId: string; team: string; injuryStatus: string | null; birthDate: string | null; age: number | null };
    const byNamePos     = new Map<string, SleeperInfo>();
    const byNormNamePos = new Map<string, SleeperInfo>();
    const byNameCount     = new Map<string, number>();
    const byName          = new Map<string, SleeperInfo>();
    const byNormNameCount = new Map<string, number>();
    const byNormName      = new Map<string, SleeperInfo>();
    const byPlayerId       = new Map<string, SleeperInfo>();
    for (const p of sleeperAllPlayers) {
        const val: SleeperInfo = { playerId: p.playerId, team: p.team, injuryStatus: p.injuryStatus, birthDate: p.birthDate, age: p.age };
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        byNamePos.set(`${exact}|${p.position}`, val);
        byNormNamePos.set(`${normd}|${p.position}`, val);
        byNameCount.set(exact, (byNameCount.get(exact) ?? 0) + 1);
        byName.set(exact, val);
        byNormNameCount.set(normd, (byNormNameCount.get(normd) ?? 0) + 1);
        byNormName.set(normd, val);
        byPlayerId.set(p.playerId, val);
    }
    function resolveSleeper(nameLower: string, position: string): SleeperInfo | undefined {
        const normd = normalizeName(nameLower);
        return byNamePos.get(`${nameLower}|${position}`)
            ?? byNormNamePos.get(`${normd}|${position}`)
            ?? (byNameCount.get(nameLower) === 1 ? byName.get(nameLower) : undefined)
            ?? (byNormNameCount.get(normd) === 1 ? byNormName.get(normd) : undefined);
    }
    // Prefer the FantasyCalcValue row's own stored sleeperPlayerId (populated
    // at sync time) — only fall back to fragile name matching when it's null.
    function resolveSleeperForFcRow(row: { nameLower: string; position: string; sleeperPlayerId: string | null }): SleeperInfo | undefined {
        return (row.sleeperPlayerId ? byPlayerId.get(row.sleeperPlayerId) : undefined)
            ?? resolveSleeper(row.nameLower, row.position);
    }

    // 5. Build DTV map keyed by lowercase name
    // Pass 1: resolve real per-game production (skill positions only) and
    // accumulate positional totals — perfFactor can't be computed until every
    // player in a position group has been seen.
    type FcRow = (typeof fcRows)[number];
    type Pending = {
        r: FcRow; team: string | null; age: number; sl: SleeperInfo | null;
        realPtsPerGame: number; standardPtsPerGame: number;
        statsPerGame: Record<string, number> | null; gamesPlayed: number | null;
    };
    const pending: Pending[] = [];
    const posPtsSum = new Map<string, number>(), posPtsCount = new Map<string, number>(), posStdPtsSum = new Map<string, number>();

    for (const r of fcRows) {
        const sl     = resolveSleeperForFcRow(r) ?? null;
        const rawTeam = sl?.team ?? null;
        const team   = (rawTeam && rawTeam !== 'FA') ? rawTeam : null;
        const age    = calculateAge(sl?.birthDate) ?? sl?.age ?? 0;

        const isSkill = SKILL_POSITIONS.has(r.position);
        const stats           = isSkill && sl?.playerId ? statsByPlayerId.get(sl.playerId) : undefined;
        const statsPerGame     = stats?.statsPerGame ?? null;
        const gamesPlayed      = stats?.gamesPlayed ?? null;
        const realPtsPerGame     = statsPerGame ? computeRealPoints(statsPerGame, scoringSettings) : 0;
        const standardPtsPerGame = statsPerGame ? computeRealPoints(statsPerGame, STANDARD_SCORING) : 0;

        if (statsPerGame && gamesPlayed) {
            posPtsSum.set(r.position, (posPtsSum.get(r.position) ?? 0) + realPtsPerGame);
            posPtsCount.set(r.position, (posPtsCount.get(r.position) ?? 0) + 1);
            posStdPtsSum.set(r.position, (posStdPtsSum.get(r.position) ?? 0) + standardPtsPerGame);
        }

        pending.push({ r, team, age, sl, realPtsPerGame, standardPtsPerGame, statsPerGame, gamesPlayed });
    }

    const posAvgPtsPerGame = new Map<string, number>();
    const posStdAvgPtsPerGame = new Map<string, number>();
    for (const [pos, sum] of posPtsSum) posAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
    for (const [pos, sum] of posStdPtsSum) posStdAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
    const posScoringFactor = new Map<string, number>();
    for (const pos of posAvgPtsPerGame.keys()) {
        posScoringFactor.set(pos, computePositionScoringFactor(posAvgPtsPerGame.get(pos) ?? 0, posStdAvgPtsPerGame.get(pos) ?? 0));
    }

    // Pass 2: build the universe entry + DTV for each player
    const dtvByName = new Map<string, { universe: UniversePlayer; finalDtv: number }>();
    for (const { r, team, age, sl, realPtsPerGame, statsPerGame, gamesPlayed } of pending) {
        const u: UniversePlayer = {
            name:            r.playerName,
            position:        r.position,
            team,
            age,
            dynasty:         normalise(r.dynastyValue),
            dynastySf:       normalise(r.dynastyValueSf),
            redraft:         normalise(r.redraftValue),
            redraftSf:       normalise(r.redraftValueSf),
            trend:           null,
            injuryStatus:    sl?.injuryStatus ?? null,
            birthDate:       null,
            playerImageUrl:  null,
            statsPerGame,
            gamesPlayed,
        };

        const individualFactor = statsPerGame && gamesPlayed
            ? computePerfFactor(realPtsPerGame, posAvgPtsPerGame.get(r.position) ?? 0, gamesPlayed)
            : 1.0;
        const positionFactor = posScoringFactor.get(r.position) ?? 1.0;
        const perfFactor     = combineScoringFactors(individualFactor, positionFactor);

        const baseValue = SKILL_POSITIONS.has(r.position)
            ? computePlayerBaseValue(u, r.position, {
                leagueType, superflex, ppr, leagueSize,
                passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe, rushAtt: leagueSettings.rushAtt,
              })
            : 0;

        const playerShell: Player = {
            rank: 0, name: r.playerName, position: r.position,
            team: team ?? 'FA', age, baseValue,
            injuryStatus: sl?.injuryStatus, perfFactor,
        };
        const dtv = SKILL_POSITIONS.has(r.position)
            ? calcDtv(playerShell, ppr, leagueType, undefined, leagueSettings)
            : { finalDtv: 0 };

        // Always prefer the higher-valued entry so a stale duplicate name (e.g.
        // "dj moore" with value 0 shadowing the canonical "d.j. moore" with value 4795)
        // never wins over the real entry.
        const exact         = r.nameLower;
        const normd         = normalizeName(r.nameLower);
        const existing      = dtvByName.get(exact);
        const existingNormd = dtvByName.get(normd);
        const entry         = { universe: u, finalDtv: dtv.finalDtv };
        if (!existing      || dtv.finalDtv > existing.finalDtv)      dtvByName.set(exact, entry);
        if (!existingNormd || dtv.finalDtv > existingNormd.finalDtv) dtvByName.set(normd, entry);
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

    // 7. Build member display-name lookup keyed by user_id (Sleeper only)
    const memberMap = new Map(members.map(m => [m.user_id, m]));

    // 8. Build each team's roster value
    const teams: RosterTeam[] = isEspn
        ? ((league.standings as EspnStandingsTeam[] | null) ?? []).map(team => {
            const rosterPlayers: RosterPlayer[] = (team.players ?? [])
                .map((p, idx) => {
                    const nameLower = p.name.toLowerCase();
                    const normd     = normalizeName(p.name);
                    const entry     = dtvByName.get(nameLower) ?? dtvByName.get(normd) ?? null;
                    const deltaInfo = deltaByName.get(nameLower) ?? deltaByName.get(normd) ?? null;
                    const sl        = resolveSleeper(nameLower, p.position) ?? null;

                    const rawTeam  = sl?.team && sl.team !== 'FA' ? sl.team : null;
                    const isTraded = !!(deltaInfo && deltaInfo.prevTeam !== null && deltaInfo.prevTeam !== rawTeam);

                    return {
                        playerId:     `${team.teamId}-${idx}-${normd}`,
                        name:         p.name,
                        position:     p.position,
                        team:         rawTeam,
                        finalDtv:     entry?.finalDtv ?? 0,
                        dynasty:      entry?.universe.dynasty ?? 0,
                        redraft:      entry?.universe.redraft ?? 0,
                        delta:        deltaInfo?.dynastyDelta ?? null,
                        injuryStatus: entry?.universe.injuryStatus ?? sl?.injuryStatus ?? null,
                        isNew:        deltaInfo?.isNew ?? false,
                        isTraded,
                    } satisfies RosterPlayer;
                })
                .sort((a, b) => b.finalDtv - a.finalDtv);

            const { breakdown, totalRosterValue } = aggregateTeam(rosterPlayers);

            return {
                rosterId:            team.teamId,
                ownerId:             team.ownerId,
                displayName:         team.name || team.ownerName || `Team ${team.teamId}`,
                rank:                0,            // assigned after sort
                tier:                'Rebuilding', // overwritten after sort
                totalRosterValue,
                positionalBreakdown: breakdown,
                players:             rosterPlayers,
            } satisfies RosterTeam;
        })
        : rosters.map(roster => {
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

            const { breakdown, totalRosterValue } = aggregateTeam(rosterPlayers);

            return {
                rosterId:            roster.roster_id,
                ownerId:             roster.owner_id,
                displayName,
                rank:                0,            // assigned after sort
                tier:                'Rebuilding', // overwritten after sort
                totalRosterValue,
                positionalBreakdown: breakdown,
                players:             rosterPlayers,
            } satisfies RosterTeam;
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
