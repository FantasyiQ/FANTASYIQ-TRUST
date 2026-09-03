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
import {
    computeRealPoints, computePerfFactor,
    computePositionScoringFactor, combineScoringFactors, STANDARD_SCORING,
} from '@/lib/rankings/leagueScoringPoints';
import { resolveProductionSignals } from '@/lib/rankings/productionSignals';
import type {
    DraftContext, DraftType, RosterProfile,
    DraftProfile, TrajectoryWindow, HorizonYears, RiskTolerance, DraftPoolADPEntry,
} from './context';
import { normalizePosition, getTier, computeTeamMode } from './context';
import { INJURY_STATUS_RISK } from '@/lib/trade-engine';

// Same real relative injury-severity ordering used across the app (Dynasty
// DTV, the redraft board) — applied here too since a live draft assistant
// recommending who to pick is exactly where a blind spot on "this player
// can't play right now" matters most. Scaled to this file's 0-100 fiqScore.
const DRAFT_INJURY_ADJUSTMENT_SCALE = 40;
function injuryAdjustedFiqScore(fiqScore: number, injuryStatus: string | null | undefined): number {
    const risk = INJURY_STATUS_RISK[injuryStatus ?? ''] ?? 0;
    return Math.max(1, fiqScore - Math.round(risk * DRAFT_INJURY_ADJUSTMENT_SCALE));
}

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

// Some real players share an exact fullName (e.g. two "Justin Jefferson"s \u2014 WR/MIN
// and LB/CLE). Resolve by name+position first (exact, then normalized name); only
// fall back to a bare name match when that name is unambiguous, so we never
// silently attach one player's team/age/id to a different player's card.
function makeSpResolver<T extends { fullName: string; position: string }>(players: T[]) {
    const byNamePos     = new Map<string, T>();
    const byNormNamePos = new Map<string, T>();
    const byNameCount     = new Map<string, number>();
    const byName          = new Map<string, T>();
    const byNormNameCount = new Map<string, number>();
    const byNormName      = new Map<string, T>();
    for (const p of players) {
        const normName = normalizeDraftName(p.fullName);
        byNamePos.set(`${p.fullName}|${p.position}`, p);
        byNormNamePos.set(`${normName}|${p.position}`, p);
        byNameCount.set(p.fullName, (byNameCount.get(p.fullName) ?? 0) + 1);
        byName.set(p.fullName, p);
        byNormNameCount.set(normName, (byNormNameCount.get(normName) ?? 0) + 1);
        byNormName.set(normName, p);
    }
    return (name: string, position: string): T | undefined => {
        const normName = normalizeDraftName(name);
        return byNamePos.get(`${name}|${position}`)
            ?? byNormNamePos.get(`${normName}|${position}`)
            ?? (byNameCount.get(name) === 1 ? byName.get(name) : undefined)
            ?? (byNormNameCount.get(normName) === 1 ? byNormName.get(normName) : undefined);
    };
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
            select: { scoringType: true, rosterPositions: true, leagueType: true, scoringSettings: true },
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

    // Belt-and-suspenders drafted check, independent of the SleeperPlayer name
    // join below. That join is an EXACT fullName match — if RookieRankingsPlayer
    // stores a suffix ("Rueben Bain Jr.") that Sleeper's own record omits
    // ("Rueben Bain"), the join misses entirely and draftedIds.has(sp.playerId)
    // never even runs (sp is undefined), silently leaving an already-drafted
    // player marked available. Sleeper's pick metadata carries the raw name
    // regardless of any join succeeding, so check that too.
    const draftedNames = new Set(
        picks
            .map(p => {
                const first = p.metadata?.first_name;
                const last  = p.metadata?.last_name;
                return first && last ? normalizeDraftName(`${first} ${last}`) : null;
            })
            .filter((n): n is string => n !== null),
    );

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

        // Broad fetch by position, not an exact-string match against FiQ's
        // own rookie names — a name-filtered query silently misses real
        // matches whenever the two sources spell a suffix differently (see
        // the comment above draftedNames, and makeSpResolver below).
        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { position: { in: [...new Set(rookies.map(r => r.position))] } },
            select: { fullName: true, playerId: true, team: true, age: true, position: true, injuryStatus: true },
        });

        const spResolver = makeSpResolver(sleeperPlayers);
        const spLookup = (name: string, position: string) => spResolver(name, position);

        // Pass 1: FiQ baseline pick — global rank across allowed positions by fiqScore (already sorted desc).
        // delta = myNextPick - fiqBaselineRank: positive = player available later than FiQ suggests.
        let fiqBaselineRank = 0;
        for (const r of rookies) {
            if (!allowedPositions.has(normalizePosition(r.position))) continue;
            const sp = spLookup(r.playerName, r.position);
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
            const sp = spLookup(r.playerName, r.position);
            if (sp && draftedIds.has(sp.playerId)) continue;
            if (draftedNames.has(normalizeDraftName(r.playerName))) continue;
            const baseFiqScore = Math.round(r.fiqScore);
            const fiqScore  = injuryAdjustedFiqScore(baseFiqScore, sp?.injuryStatus);
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
                injuryStatus:     sp?.injuryStatus ?? null,
            });
        }
    } else {
        // Recommendations pool: high-quality players worth drafting (value > 300).
        // Redraft leagues must rank off FantasyCalc's redraft value, not dynasty —
        // dynasty value bakes in age/long-term upside a redrafter never drafts for,
        // which is exactly what pushed e.g. Ja'Marr Chase (higher dynasty value)
        // above Jahmyr Gibbs/Bijan Robinson (higher redraft value, and the real
        // consensus 1-2 picks) in redraft leagues before this fix.
        const fcValueSelect = { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, sleeperPlayerId: true } as const;
        const fcValues = isDynasty
            ? (superflex
                ? await prisma.fantasyCalcValue.findMany({ where: { dynastyValueSf: { gt: 300 } }, orderBy: { dynastyValueSf: 'desc' }, take: 500, select: fcValueSelect })
                : await prisma.fantasyCalcValue.findMany({ where: { dynastyValue: { gt: 300 } }, orderBy: { dynastyValue: 'desc' }, take: 500, select: fcValueSelect }))
            : (superflex
                ? await prisma.fantasyCalcValue.findMany({ where: { redraftValueSf: { gt: 300 } }, orderBy: { redraftValueSf: 'desc' }, take: 500, select: fcValueSelect })
                : await prisma.fantasyCalcValue.findMany({ where: { redraftValue: { gt: 300 } }, orderBy: { redraftValue: 'desc' }, take: 500, select: fcValueSelect }));

        // FPDO pool: wider net (value > 50) so positional ranks reflect the full draftable universe.
        // Without this, a TE with value 250 is excluded and players like Max Klare inflate to TE5
        // when they're actually TE12+ — producing misleadingly large FPDO deltas.
        const fcFpdo = isDynasty
            ? (superflex
                ? await prisma.fantasyCalcValue.findMany({ where: { dynastyValueSf: { gt: 50 } }, orderBy: { dynastyValueSf: 'desc' }, take: 1000, select: fcValueSelect })
                : await prisma.fantasyCalcValue.findMany({ where: { dynastyValue: { gt: 50 } }, orderBy: { dynastyValue: 'desc' }, take: 1000, select: fcValueSelect }))
            : (superflex
                ? await prisma.fantasyCalcValue.findMany({ where: { redraftValueSf: { gt: 50 } }, orderBy: { redraftValueSf: 'desc' }, take: 1000, select: fcValueSelect })
                : await prisma.fantasyCalcValue.findMany({ where: { redraftValue: { gt: 50 } }, orderBy: { redraftValue: 'desc' }, take: 1000, select: fcValueSelect }));

        // Broad fetch, not an exact-string match against FantasyCalc's own
        // playerName — a name-filtered query silently misses real matches
        // whenever the two sources spell a suffix differently (see
        // draftedNames above, and makeSpResolver below). This was the
        // actual root cause of real active players like "Kenneth Walker
        // III" / "Brian Thomas Jr." showing as FA with no team/age: the
        // old `in: allFpdoNames` filter never even fetched their Sleeper
        // row, since FantasyCalc's playerName carries the suffix and
        // Sleeper's fullName doesn't.
        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { active: true },
            select: { fullName: true, playerId: true, team: true, age: true, position: true, injuryStatus: true },
        });

        const spResolver2 = makeSpResolver(sleeperPlayers);
        const spLookup2 = (name: string, position: string) => spResolver2(name, position);

        // FantasyCalcValue rows carry a real, sync-time-resolved sleeperPlayerId
        // (backfilled from the same suffix/nickname-safe matcher, stored so readers
        // don't have to re-resolve by name every time). Prefer that direct ID lookup;
        // only fall back to name matching for rows where it's still null (old rows
        // not yet migrated, or genuinely unmatched players).
        const byPlayerId2 = new Map(sleeperPlayers.map(p => [p.playerId, p]));
        function resolveSpForFcRow2(row: { playerName: string; position: string; sleeperPlayerId: string | null }) {
            return (row.sleeperPlayerId ? byPlayerId2.get(row.sleeperPlayerId) : undefined)
                ?? spLookup2(row.playerName, row.position);
        }

        // Pass 1: FiQ baseline pick — global rank across allowed positions by dynasty value (fcFpdo already sorted desc).
        // delta = myNextPick - fiqBaselineRank: positive = player available later than FiQ suggests.
        // Uses fcFpdo (value > 50) so the full draftable universe is ranked, not just top-300.
        // Deliberately NOT perfFactor-adjusted — this is the market's real draft-capital
        // baseline (analogous to ADP), a different signal from the per-league scoring
        // adjustment applied to fiqScore below.
        let fiqBaselineRank = 0;
        for (const fcv of fcFpdo) {
            if (!allowedPositions.has(normalizePosition(fcv.position))) continue;
            const sp = resolveSpForFcRow2(fcv);
            if (!sp?.playerId) continue;
            fiqBaselineRank++;
            draftPoolPlayers.push(sp.playerId);
            draftPoolADP[sp.playerId] = {
                playerId:      sp.playerId,
                isRookie:      false,
                isVet:         true,
                adpRankInPool: fiqBaselineRank,   // FiQ baseline pick: global dynasty value rank in pool
                adpSource:     'fa',
            };
        }

        // League Scoring Points Engine: adjust each player's fiqScore by how their
        // real per-game production (under this league's exact scoring settings)
        // compares to their position's average — same computePerfFactor/
        // computePositionScoringFactor pattern already shipped on the Rankings page
        // (getLeagueRankings.ts), so a league's real scoring rules (rush-attempt
        // bonuses, TE premium, etc.) shift who the assistant recommends, not just a
        // generic FantasyCalc market-consensus number.
        const scoringSettings = (dbLeague.scoringSettings as Record<string, number> | null) ?? STANDARD_SCORING;
        // Real production signal per player: this season's real stats if any
        // games have been played, else this season's real projection
        // (reflects this year's actual team/role/health), else last
        // season's real stats as a final fallback. See productionSignals.ts.
        const statsByPlayerId = await resolveProductionSignals(sleeperPlayers.map(p => p.playerId));

        // Pass 2a: resolve real per-game production for every player in the
        // recommendation pool and accumulate positional totals — perfFactor can't
        // be computed until every player in a position group has been seen.
        type FcPending = { fcv: (typeof fcValues)[number]; sp: ReturnType<typeof resolveSpForFcRow2>; realPtsPerGame: number; gamesPlayed: number | null };
        const fcPending: FcPending[] = [];
        const posPtsSum    = new Map<string, number>();
        const posPtsCount  = new Map<string, number>();
        const posStdPtsSum = new Map<string, number>(); // same players, scored under STANDARD_SCORING

        for (const fcv of fcValues) {
            if (!allowedPositions.has(normalizePosition(fcv.position))) continue;
            const sp = resolveSpForFcRow2(fcv);
            if (sp && draftedIds.has(sp.playerId)) continue;
            if (draftedNames.has(normalizeDraftName(fcv.playerName))) continue;

            const stats             = sp?.playerId ? statsByPlayerId.get(sp.playerId) : undefined;
            const realPtsPerGame    = stats ? computeRealPoints(stats.statsPerGame, scoringSettings) : 0;
            const standardPtsPerGame = stats ? computeRealPoints(stats.statsPerGame, STANDARD_SCORING) : 0;

            if (stats && stats.gamesPlayed) {
                posPtsSum.set(fcv.position, (posPtsSum.get(fcv.position) ?? 0) + realPtsPerGame);
                posPtsCount.set(fcv.position, (posPtsCount.get(fcv.position) ?? 0) + 1);
                posStdPtsSum.set(fcv.position, (posStdPtsSum.get(fcv.position) ?? 0) + standardPtsPerGame);
            }

            fcPending.push({ fcv, sp, realPtsPerGame, gamesPlayed: stats?.gamesPlayed ?? null });
        }

        const posAvgPtsPerGame    = new Map<string, number>();
        const posStdAvgPtsPerGame = new Map<string, number>();
        for (const [pos, sum] of posPtsSum)    posAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
        for (const [pos, sum] of posStdPtsSum) posStdAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));

        // Cross-positional shift: how this league's real scoring moves each whole
        // position relative to a generic PPR baseline — applies uniformly, unlike
        // perfFactor which varies per player.
        const posScoringFactor = new Map<string, number>();
        for (const pos of posAvgPtsPerGame.keys()) {
            posScoringFactor.set(pos, computePositionScoringFactor(
                posAvgPtsPerGame.get(pos) ?? 0,
                posStdAvgPtsPerGame.get(pos) ?? 0,
            ));
        }

        // Pass 2b: available players = undrafted, allowed positions only, fiqScore
        // adjusted by the combined perfFactor.
        for (const { fcv, sp, realPtsPerGame, gamesPlayed } of fcPending) {
            const marketValue = isDynasty
                ? (superflex ? fcv.dynastyValueSf : fcv.dynastyValue)
                : (superflex ? fcv.redraftValueSf : fcv.redraftValue);

            const individualFactor = gamesPlayed
                ? computePerfFactor(realPtsPerGame, posAvgPtsPerGame.get(fcv.position) ?? 0, gamesPlayed)
                : 1.0;
            const positionFactor = posScoringFactor.get(fcv.position) ?? 1.0;
            const perfFactor     = combineScoringFactors(individualFactor, positionFactor);

            // Additive, bounded nudge rather than a multiplier on marketValue directly —
            // marketValue/90 already saturates at 100 for most elite players (value
            // caps at 9999), so multiplying by perfFactor (up to 1.4375x) would collapse
            // the entire top of the pool to identical scores, exactly where the draft
            // assistant's ranking matters most. A capped additive nudge (matches how
            // scoreCandidate() layers needBoost/oppBoost onto fiqScore) preserves real
            // differentiation while still reflecting the league's real scoring shift.
            const baseFiqScore   = Math.min(100, Math.round(marketValue / 90));
            const perfAdjustment = Math.round((perfFactor - 1) * 20);
            const preInjuryScore = Math.min(100, Math.max(1, baseFiqScore + perfAdjustment));
            const fiqScore       = injuryAdjustedFiqScore(preInjuryScore, sp?.injuryStatus);
            availablePlayers.push({
                sleeperPlayerId: sp?.playerId ?? '',
                name:            fcv.playerName,
                position:        fcv.position,
                team:            sp?.team ?? null,
                age:             sp?.age ?? null,
                fiqScore,
                tier:            getTier(fiqScore),
                opportunityScore: null,
                injuryStatus:    sp?.injuryStatus ?? null,
            });
        }
    }

    // ── TeamMode (roster snapshot) ──────────────────────────────────────────
    // Broad fetch by position, not an exact-string match against Sleeper's
    // own fullName — FantasyCalc spells some players with a generational
    // suffix ("Kenneth Walker III") that Sleeper's fullName omits, so a
    // `playerName: { in: rosterNames } }` filter silently misses those
    // players' FantasyCalc row (see buildSleeperNameResolver's header for
    // the same pattern in the other direction).
    const rosterPositionsSet = [...new Set([
        ...existingPlayers.map(p => p.position),
        ...myPickPlayers.map(p => p.position),
    ])];
    const rosterFcValues = rosterPositionsSet.length > 0
        ? await prisma.fantasyCalcValue.findMany({
            where:  { position: { in: rosterPositionsSet } },
            select: { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, sleeperPlayerId: true },
        })
        : [];
    const fcResolver = makeSpResolver(rosterFcValues.map(v => ({ ...v, fullName: v.playerName })));

    // Prefer FantasyCalcValue's real, sync-time-resolved sleeperPlayerId over a
    // name-based lookup (see resolveSpForFcRow2 above for the same pattern in the
    // recommendations pool) — only fall back to fcResolver's name matching for FC
    // rows that don't have it set yet.
    const fcByPlayerId = new Map(
        rosterFcValues.filter((v): v is typeof v & { sleeperPlayerId: string } => v.sleeperPlayerId != null)
            .map(v => [v.sleeperPlayerId, v]),
    );

    function toRosterProfile(p: { playerId?: string; fullName?: string | null; position: string; age?: number | null }): RosterProfile {
        const fc = (p.playerId ? fcByPlayerId.get(p.playerId) : undefined)
            ?? (p.fullName ? fcResolver(p.fullName, p.position) : undefined);
        const marketValue = fc
            ? (isDynasty
                ? (superflex ? fc.dynastyValueSf : fc.dynastyValue)
                : (superflex ? fc.redraftValueSf : fc.redraftValue))
            : null;
        const fiqScore = marketValue != null ? Math.min(100, Math.round(marketValue / 90)) : null;
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
