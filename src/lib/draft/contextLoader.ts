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

    const rosterPositions = dbLeague.rosterPositions as string[];
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
    const myPickIds = picks
        .filter(p => p.roster_id === mySleeperRoster.roster_id)
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

        // Pass 1: build FPDO (Fantasy Positional Draft Order) for all players (including drafted).
        // Group by position, sort by NFL draft pick within each position → adpRankInPool = positional rank.
        const rookiesByPos: Record<string, typeof rookies> = {};
        for (const r of rookies) {
            (rookiesByPos[r.position] ??= []).push(r);
        }
        for (const posGroup of Object.values(rookiesByPos)) {
            posGroup.sort((a, b) => a.overallPick - b.overallPick);
            posGroup.forEach((r, idx) => {
                const sp = spLookup(r.playerName);
                if (!sp?.playerId) return;
                draftPoolPlayers.push(sp.playerId);
                draftPoolADP[sp.playerId] = {
                    playerId:      sp.playerId,
                    isRookie:      true,
                    isVet:         false,
                    adpRankInPool: idx + 1,   // FPDO: 1 = first at this position by NFL draft order
                    adpSource:     'rookie',
                };
            });
        }

        // Pass 2: available players = undrafted only
        for (const r of rookies) {
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

        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { fullName: { in: fcValues.map(v => v.playerName) }, active: true },
            select: { fullName: true, playerId: true, team: true, age: true },
        });

        const spByName2       = new Map(sleeperPlayers.map(p => [p.fullName, p]));
        const spByNormalName2 = new Map(sleeperPlayers.map(p => [normalizeDraftName(p.fullName), p]));
        const spLookup2 = (name: string) => spByName2.get(name) ?? spByNormalName2.get(normalizeDraftName(name));

        // Pass 1: build FPDO (Fantasy Positional Draft Order) for all players (including drafted).
        // Group by position, sort by KTC value descending within each position → adpRankInPool = positional rank.
        const fcByPos: Record<string, typeof fcValues> = {};
        for (const fcv of fcValues) {
            (fcByPos[fcv.position] ??= []).push(fcv);
        }
        for (const posGroup of Object.values(fcByPos)) {
            const ktcKey = superflex ? 'dynastyValueSf' : 'dynastyValue';
            posGroup.sort((a, b) => b[ktcKey] - a[ktcKey]);
            posGroup.forEach((fcv, idx) => {
                const sp = spLookup2(fcv.playerName);
                if (!sp?.playerId) return;
                draftPoolPlayers.push(sp.playerId);
                draftPoolADP[sp.playerId] = {
                    playerId:      sp.playerId,
                    isRookie:      false,
                    isVet:         true,
                    adpRankInPool: idx + 1,   // FPDO: 1 = best at this position by KTC value
                    adpSource:     'fa',
                };
            });
        }

        // Pass 2: available players = undrafted only
        for (const fcv of fcValues) {
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
        },
    };
}
