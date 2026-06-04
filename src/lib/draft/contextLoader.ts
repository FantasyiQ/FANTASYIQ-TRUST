// FantasyiQ Trust — Live Draft Assistant — Context Loader
// Builds a DraftContext from Sleeper API + DB for use by the scoring engine.
// Integrates TrajectoryiQ for forward-looking DraftProfile computation.

import { prisma } from '@/lib/prisma';
import {
    getLeagueRosters,
    getSleeperDraft,
    getActiveDraftPicks,
    resolveDraftType,
    type SleeperRoster,
    type SleeperDraft,
    type SleeperDraftPickEntry,
} from '@/lib/sleeper';
import type {
    DraftContext, DraftType, RosterProfile,
    DraftProfile, TrajectoryWindow, HorizonYears, RiskTolerance, DraftPoolADPEntry,
} from './context';
import { normalizePosition, getTier, computeTeamMode } from './context';

/** Normalizes a player name for fuzzy fallback matching.
 *  Strips Jr/Sr/II/III/IV/V suffixes, apostrophes, periods, and extra whitespace. */
function normalizeDraftName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[''\u2018\u2019]/g, '')          // remove apostrophes (including curly)
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')  // remove suffixes
        .replace(/\./g, '')                        // remove periods
        .replace(/\s+/g, ' ')
        .trim();
}
import { getLeagueContext } from '@/lib/trajectory/contextLoader';
import { computeTeamTrajectoryForLeague } from '@/lib/trajectory/teamTrajectory';
import type { TeamTrajectory, TrajectoryMode, WinCurve } from '@/lib/trajectory/types';
import type { LeaguePhaseResult } from '@/lib/leaguePhase';

// ── User's next pick resolution ───────────────────────────────────────────────
//
// The FPDO delta should be computed against the pick where the USER will be
// making their selection, not the current overall pick (which may belong to
// another team). This function finds the next pick overall that belongs to
// the user's draft slot in a snake draft.

function deriveMyNextPickOverall(
    currentPickOverall: number,
    totalTeams:         number,
    totalRounds:        number,
    userSlot:           number | null | undefined,
    draftType:          string,
): number {
    if (!userSlot) return currentPickOverall;

    for (let round = Math.ceil(currentPickOverall / totalTeams); round <= totalRounds; round++) {
        const pickInRound = (draftType === 'snake' && round % 2 === 0)
            ? totalTeams - userSlot + 1
            : userSlot;
        const pickOverall = (round - 1) * totalTeams + pickInRound;
        if (pickOverall >= currentPickOverall) return pickOverall;
    }
    return currentPickOverall; // draft is over
}

// ── On-the-clock resolution ────────────────────────────────────────────────────

function deriveOnTheClockRosterId(
    draft:   SleeperDraft,
    picks:   SleeperDraftPickEntry[],
    rosters: SleeperRoster[],
): string | null {
    if (!draft.draft_order) return null;

    const totalTeams = draft.settings.teams;
    const nextPickNo = picks.length + 1;
    const round      = Math.ceil(nextPickNo / totalTeams);
    const posInRound = ((nextPickNo - 1) % totalTeams) + 1;

    const slot = (draft.type === 'snake' && round % 2 === 0)
        ? totalTeams - posInRound + 1
        : posInRound;

    const targetUserId = Object.entries(draft.draft_order).find(([, s]) => s === slot)?.[0];
    if (!targetUserId) return null;

    const roster = rosters.find(r => r.owner_id === targetUserId);
    return roster ? String(roster.roster_id) : null;
}

// ── DraftProfile construction ─────────────────────────────────────────────────

function trajectoryWindowFromTrajectory(
    winCurve: WinCurve,
    mode: TrajectoryMode,
): TrajectoryWindow {
    // Mode takes precedence for strong signals
    if (mode === 'CONTENDER')  return 'WIN_NOW';
    if (mode === 'REBUILDER')  return 'REBUILD';
    if (mode === 'DECLINING')  return 'REBUILD';
    // Fall back to winCurve
    if (winCurve === 'PEAKING_NOW') return 'WIN_NOW';
    if (winCurve === 'PEAK_AHEAD')  return 'ASCENDING';
    if (winCurve === 'FALLING')     return 'REBUILD';
    return 'PLATEAU'; // FLAT → PLATEAU
}

function horizonFromWindow(window: TrajectoryWindow): HorizonYears {
    if (window === 'WIN_NOW')   return 1;
    if (window === 'ASCENDING') return 2;
    return 3; // PLATEAU, REBUILD
}

function riskToleranceFromTrajectory(
    pickCapital: number,
    mode: TrajectoryMode,
): RiskTolerance {
    if (pickCapital >= 65 || mode === 'REBUILDER') return 'HIGH';
    if (pickCapital <= 35 || mode === 'DECLINING') return 'LOW';
    return 'MEDIUM';
}

function buildDraftProfile(
    teamMode: ReturnType<typeof computeTeamMode>,
    trajectory: TeamTrajectory | null,
): DraftProfile {
    if (!trajectory) {
        // Fallback: derive trajectory from teamMode alone
        const trajectoryWindow: TrajectoryWindow =
            teamMode === 'WIN_NOW' ? 'WIN_NOW' :
            teamMode === 'REBUILD' ? 'REBUILD' :
            'PLATEAU';
        return {
            teamMode,
            trajectoryWindow,
            horizonYears:    horizonFromWindow(trajectoryWindow),
            riskTolerance:   'MEDIUM',
        };
    }

    const trajectoryWindow = trajectoryWindowFromTrajectory(trajectory.winCurve, trajectory.mode);
    const horizonYears     = horizonFromWindow(trajectoryWindow);
    const riskTolerance    = riskToleranceFromTrajectory(trajectory.pickCapital, trajectory.mode);

    return { teamMode, trajectoryWindow, horizonYears, riskTolerance };
}

// ── Allowed player positions ──────────────────────────────────────────────────
//
// Derives the set of NORMALIZED player positions that have starting-roster slots
// in this specific league. Used to filter the draft pool so the LDA never surfaces
// positions the league doesn't use (no IDP in skill-only leagues, no K in no-kicker
// leagues, etc.). Everything comes from Sleeper's roster_positions — no assumptions.
//
// Bench (BN) and IR are intentionally excluded: holding-slot positions don't define
// what's worth drafting. Only slots where a player can score points are counted.

function deriveAllowedPlayerPositions(rosterPositions: string[]): Set<string> {
    const allowed = new Set<string>();
    for (const slot of rosterPositions) {
        switch (slot) {
            case 'QB':         allowed.add('QB'); break;
            case 'RB':         allowed.add('RB'); break;
            case 'WR':         allowed.add('WR'); break;
            case 'TE':         allowed.add('TE'); break;
            case 'K':          allowed.add('K');  break;
            case 'DEF':        allowed.add('DEF'); break;
            case 'FLEX':       allowed.add('RB'); allowed.add('WR'); allowed.add('TE'); break;
            case 'REC_FLEX':   allowed.add('WR'); allowed.add('TE'); break;
            case 'SUPER_FLEX': allowed.add('QB'); allowed.add('RB'); allowed.add('WR'); allowed.add('TE'); break;
            case 'TE_FLEX':    allowed.add('WR'); allowed.add('TE'); break;
            // Any IDP slot type → normalized IDP
            case 'IDP_FLEX':
            case 'DL': case 'LB': case 'DB':
                allowed.add('IDP'); break;
            // BN, IR — not starting slots; skip
        }
    }
    return allowed;
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function loadDraftContext(params: {
    leagueDbId:      string;
    sleeperLeagueId: string;
    sleeperDraftId:  string;
    myRosterId:      string | null;
    sleeperUserId?:  string | null;   // authenticated user's Sleeper ID — used for authoritative owner_id binding
}): Promise<DraftContext> {
    const { leagueDbId, sleeperLeagueId, sleeperDraftId, myRosterId, sleeperUserId } = params;
    const myRosterIdNum = myRosterId ? parseInt(myRosterId, 10) : NaN;

    const [draft, picks, rosters, dbLeague] = await Promise.all([
        getSleeperDraft(sleeperDraftId),
        getActiveDraftPicks(sleeperDraftId),
        getLeagueRosters(sleeperLeagueId),
        prisma.league.findUniqueOrThrow({
            where:  { id: leagueDbId },
            select: { scoringType: true, rosterPositions: true, leagueType: true },
        }),
    ]);

    const rosterPositions  = dbLeague.rosterPositions as string[];
    const allowedPositions = deriveAllowedPlayerPositions(rosterPositions);
    const superflex  = rosterPositions.includes('SUPER_FLEX');
    const tePremium  = rosterPositions.includes('TE_FLEX');
    const ppr        = dbLeague.scoringType === 'ppr';
    const bestBall   = (draft.metadata?.scoring_type ?? '').includes('best_ball');
    const isDynasty  = dbLeague.leagueType === 'Dynasty';

    const leagueHasRosters = rosters.some(r => (r.players ?? []).length > 0);
    const draftType: DraftType = leagueHasRosters
        ? 'rookie'
        : (resolveDraftType(draft) === 'rookie' ? 'rookie' : 'startup');

    const rosterSlots = rosterPositions.reduce<Record<string, number>>((acc, slot) => {
        acc[slot] = (acc[slot] ?? 0) + 1;
        return acc;
    }, {});

    const totalTeams         = draft.settings.teams;
    const totalRounds        = draft.settings.rounds;
    const currentPickOverall = picks.length + 1;
    const currentRound       = Math.ceil(currentPickOverall / totalTeams);
    const onTheClockRosterId = deriveOnTheClockRosterId(draft, picks, rosters);

    // Compute user's next pick — used for FPDO delta so recs reflect the user's
    // actual turn, not the current on-clock pick (which may belong to another team).
    // Resolved after mySleeperRoster binding below; placeholder until then.
    let myNextPickOverall = currentPickOverall;

    const picksSoFar = picks.map(p => ({
        pickOverall:     p.pick_no,
        round:           p.round,
        rosterId:        String(p.roster_id),
        sleeperPlayerId: p.player_id,
    }));

    const draftedIds = new Set(picks.map(p => p.player_id));

    // ── Full existing roster ────────────────────────────────────────────────
    // Binding priority:
    //   1. sleeperUserId (server-authoritative, matches owner_id) — always correct
    //   2. myRosterIdNum from the UI param — fallback when sleeperUserId is unknown
    const byOwnerId   = sleeperUserId ? rosters.find(r => r.owner_id === sleeperUserId) : undefined;
    const byRosterId  = isNaN(myRosterIdNum) ? undefined : rosters.find(r => r.roster_id === myRosterIdNum);
    const mySleeperRoster = byOwnerId ?? byRosterId;
    const boundByOwnerId  = Boolean(byOwnerId);

    if (!mySleeperRoster) {
        // Hard fail — do not return generic recommendations for an unknown user
        const err = new Error('Roster binding failed: no roster matched sleeperUserId or myRosterId') as Error & { code: string };
        err.code = 'NO_ROSTER_BOUND';
        throw err;
    }

    const existingPlayerIds = (mySleeperRoster.players ?? []).filter(id => id && id !== '0');
    const mySleeperUserId   = mySleeperRoster.owner_id ?? sleeperUserId ?? null;

    // Now that we know the user's Sleeper ID, resolve their draft slot and next pick.
    const userSlot = mySleeperUserId && draft.draft_order
        ? (draft.draft_order[mySleeperUserId] ?? null)
        : null;
    myNextPickOverall = deriveMyNextPickOverall(currentPickOverall, totalTeams, totalRounds, userSlot, draft.type);

    const existingPlayers = existingPlayerIds.length > 0
        ? await prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: existingPlayerIds } },
            select: { playerId: true, position: true, fullName: true, age: true },
        })
        : [];

    const fullRoster = existingPlayers.map(p => ({
        sleeperPlayerId: p.playerId,
        position:        normalizePosition(p.position),
    }));

    // ── My picks from this draft ─────────────────────────────────────────────
    // Use mySleeperRoster.roster_id (the authoritatively bound roster),
    // NOT myRosterIdNum (the UI param) — these can differ if owner_id binding fired.
    // Explicit Number() coercion guards against JSON string/number ambiguity.
    const myRosterId_ = Number(mySleeperRoster.roster_id);
    const myPickIds = picks
        .filter(p => Number(p.roster_id) === myRosterId_)
        .map(p => p.player_id);

    const myPickPlayers = myPickIds.length > 0
        ? await prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: myPickIds } },
            select: { playerId: true, position: true, fullName: true, age: true },
        })
        : [];

    const myRosterData = myPickPlayers.map(p => ({
        sleeperPlayerId: p.playerId,
        position:        normalizePosition(p.position),
    }));

    const myEffectiveRoster = [...fullRoster, ...myRosterData];

    // ── Available player pool + Draft Pool ADP ──────────────────────────────
    // Build pool ADP by iterating ALL players (including drafted) in value-sorted
    // order. Pool rank = position in this list (1 = best in pool).
    // Then filter to availablePlayers = undrafted only.

    const availablePlayers: DraftContext['availablePlayers'] = [];
    const draftPoolPlayers: string[]                         = [];
    const draftPoolADP:     Record<string, DraftPoolADPEntry> = {};

    if (draftType === 'rookie') {
        const rookies = await prisma.rookieRankingsPlayer.findMany({
            where:   { season: '2026' },
            orderBy: { fiqScore: 'desc' },
            select:  { playerName: true, position: true, fiqScore: true, fiqTier: true, opportunityScore: true, overallPick: true },
        });

        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { fullName: { in: rookies.map(r => r.playerName) } },
            select: { fullName: true, playerId: true, team: true, age: true },
        });

        const spByName         = new Map(sleeperPlayers.map(p => [p.fullName, p]));
        const spByNormalName   = new Map(sleeperPlayers.map(p => [normalizeDraftName(p.fullName), p]));
        const spLookup = (name: string) => spByName.get(name) ?? spByNormalName.get(normalizeDraftName(name));

        // Pass 1: FiQ baseline pick — global rank across allowed positions by fiqScore (already sorted desc).
        // delta = myNextPick - fiqBaselineRank: positive = player available later than FiQ suggests.
        let fiqBaselineRank = 0;
        for (const r of rookies) {
            if (!allowedPositions.has(normalizePosition(r.position))) continue;
            const sp = spLookup(r.playerName);
            if (!sp?.playerId) continue;
            fiqBaselineRank++;
            draftPoolPlayers.push(sp.playerId);
            draftPoolADP[sp.playerId] = {
                playerId:      sp.playerId,
                isRookie:      true,
                isVet:         false,
                adpRankInPool: fiqBaselineRank,   // FiQ baseline pick: global rank by fiqScore
                adpSource:     'rookie',
            };
        }

        // Pass 2: available players = undrafted, allowed positions only
        for (const r of rookies) {
            if (!allowedPositions.has(normalizePosition(r.position))) continue;
            const sp = spLookup(r.playerName);
            if (sp && draftedIds.has(sp.playerId)) continue;
            const fiqScore  = Math.round(r.fiqScore);
            const tierMatch = r.fiqTier?.match(/(\d+)/);
            const tier      = tierMatch ? parseInt(tierMatch[1], 10) : getTier(fiqScore);
            availablePlayers.push({
                sleeperPlayerId:  sp?.playerId ?? '',
                name:             r.playerName,
                position:         r.position,
                team:             sp?.team ?? null,
                age:              sp?.age ?? null,
                fiqScore,
                tier,
                opportunityScore: r.opportunityScore ?? null,
            });
        }
    } else {
        // Recommendations pool: high-quality players worth drafting (value > 300).
        const fcValues = superflex
            ? await prisma.fantasyCalcValue.findMany({
                where:   { dynastyValueSf: { gt: 300 } },
                orderBy: { dynastyValueSf: 'desc' },
                take:    500,
                select:  { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true },
            })
            : await prisma.fantasyCalcValue.findMany({
                where:   { dynastyValue: { gt: 300 } },
                orderBy: { dynastyValue: 'desc' },
                take:    500,
                select:  { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true },
            });

        // FPDO pool: wider net (value > 50) so positional ranks reflect the full draftable universe.
        // Without this, a TE with value 250 is excluded and players like Max Klare inflate to TE5
        // when they're actually TE12+ — producing misleadingly large FPDO deltas.
        const fcFpdo = superflex
            ? await prisma.fantasyCalcValue.findMany({
                where:   { dynastyValueSf: { gt: 50 } },
                orderBy: { dynastyValueSf: 'desc' },
                take:    1000,
                select:  { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true },
            })
            : await prisma.fantasyCalcValue.findMany({
                where:   { dynastyValue: { gt: 50 } },
                orderBy: { dynastyValue: 'desc' },
                take:    1000,
                select:  { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true },
            });

        const allFpdoNames = Array.from(new Set([
            ...fcValues.map(v => v.playerName),
            ...fcFpdo.map(v => v.playerName),
        ]));

        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { fullName: { in: allFpdoNames }, active: true },
            select: { fullName: true, playerId: true, team: true, age: true },
        });

        const spByName2       = new Map(sleeperPlayers.map(p => [p.fullName, p]));
        const spByNormalName2 = new Map(sleeperPlayers.map(p => [normalizeDraftName(p.fullName), p]));
        const spLookup2 = (name: string) => spByName2.get(name) ?? spByNormalName2.get(normalizeDraftName(name));

        // Pass 1: FiQ baseline pick — global rank across allowed positions by KTC value (fcFpdo already sorted desc).
        // delta = myNextPick - fiqBaselineRank: positive = player available later than FiQ suggests.
        // Uses fcFpdo (value > 50) so the full draftable universe is ranked, not just top-300.
        let fiqBaselineRank = 0;
        for (const fcv of fcFpdo) {
            if (!allowedPositions.has(normalizePosition(fcv.position))) continue;
            const sp = spLookup2(fcv.playerName);
            if (!sp?.playerId) continue;
            fiqBaselineRank++;
            draftPoolPlayers.push(sp.playerId);
            draftPoolADP[sp.playerId] = {
                playerId:      sp.playerId,
                isRookie:      false,
                isVet:         true,
                adpRankInPool: fiqBaselineRank,   // FiQ baseline pick: global KTC rank in pool
                adpSource:     'fa',
            };
        }

        // Pass 2: available players = undrafted, allowed positions only
        for (const fcv of fcValues) {
            if (!allowedPositions.has(normalizePosition(fcv.position))) continue;
            const sp = spLookup2(fcv.playerName);
            if (sp && draftedIds.has(sp.playerId)) continue;
            const ktcValue = superflex ? fcv.dynastyValueSf : fcv.dynastyValue;
            const fiqScore = Math.min(100, Math.round(ktcValue / 90));
            availablePlayers.push({
                sleeperPlayerId: sp?.playerId ?? '',
                name:            fcv.playerName,
                position:        fcv.position,
                team:            sp?.team ?? null,
                age:             sp?.age ?? null,
                fiqScore,
                tier:            getTier(fiqScore),
                opportunityScore: null,
            });
        }
    }

    // ── TeamMode (roster snapshot) ──────────────────────────────────────────
    const rosterNames = [
        ...existingPlayers.map(p => p.fullName),
        ...myPickPlayers.map(p => p.fullName),
    ].filter((n): n is string => Boolean(n));

    const rosterFcValues = rosterNames.length > 0
        ? await prisma.fantasyCalcValue.findMany({
            where:  { playerName: { in: rosterNames } },
            select: { playerName: true, dynastyValue: true, dynastyValueSf: true },
        })
        : [];

    const fcByName = new Map(rosterFcValues.map(v => [v.playerName, v]));

    function toRosterProfile(p: { fullName?: string | null; position: string; age?: number | null }): RosterProfile {
        const fc       = p.fullName ? fcByName.get(p.fullName) : undefined;
        const ktcValue = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
        const fiqScore = ktcValue != null ? Math.min(100, Math.round(ktcValue / 90)) : null;
        return { position: normalizePosition(p.position), age: p.age ?? null, fiqScore };
    }

    const teamMode = computeTeamMode([
        ...existingPlayers.map(toRosterProfile),
        ...myPickPlayers.map(toRosterProfile),
    ]);

    // ── TrajectoryiQ integration ────────────────────────────────────────────
    // Fetch full league trajectory so pick capital can be normalized against
    // the league average, then extract only the current user's team.
    let myTrajectory: TeamTrajectory | null = null;

    try {
        const currentYear = new Date().getFullYear();
        const minimalPhase: LeaguePhaseResult = {
            phase:            'PRE_DRAFT',
            activeRookieYear: currentYear,
            pickYears:        [currentYear, currentYear + 1, currentYear + 2] as [number, number, number],
            useBucketedPicks: false,
            isWinNowWindow:   false,
            missingSettings:  false,
            currentWeek:      0,
            playoffWeekStart: null,
            champWeek:        null,
        };

        const { context: leagueCtx, myTeamId } = await getLeagueContext(
            sleeperLeagueId,
            mySleeperUserId,
            String(currentYear),
            isDynasty,
            superflex,
            minimalPhase,
        );

        const trajectoryMap = computeTeamTrajectoryForLeague(leagueCtx);
        myTrajectory = myTeamId ? (trajectoryMap.get(myTeamId) ?? null) : null;
    } catch {
        // Trajectory is non-critical — continue with teamMode-only DraftProfile
    }

    const draftProfile = buildDraftProfile(teamMode, myTrajectory);

    return {
        leagueId:        leagueDbId,
        sleeperLeagueId,
        sleeperDraftId,
        draftType,
        draftProfile,
        scoring:  { ppr, superflex, tePremium, bestBall, rosterSlots },
        draftMeta: {
            totalTeams,
            totalRounds,
            currentRound,
            currentPickOverall,
            myNextPickOverall,
            picksPerRound: totalTeams,
            onTheClockRosterId,
        },
        picksSoFar,
        myRoster:          myRosterData,
        fullRoster,
        myEffectiveRoster,
        availablePlayers,
        draftPoolPlayers,
        draftPoolADP,
        binding: {
            rosterFound:       true,
            resolvedRosterId:  mySleeperRoster.roster_id,
            rosterPlayerCount: existingPlayerIds.length,
            myPickCount:       myPickIds.length,
            sleeperUserIdUsed: mySleeperUserId,
            boundByOwnerId,
            draftStatus:       draft.status,
        },
    };
}
