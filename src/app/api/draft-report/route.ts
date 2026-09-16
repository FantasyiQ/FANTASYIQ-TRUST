// GET /api/draft-report?leagueId=...&sleeperDraftId=...&myRosterId=...
// Post-draft report card: pick alignment, tier distribution, franchise state.

import { type NextRequest } from 'next/server';
import { auth }   from '@/lib/auth';
import { requireLeaguePaidAccess } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';
import {
    getSleeperDraft,
    getActiveDraftPicks,
    getLeagueRosters,
    resolveDraftType,
    getPlayers,
} from '@/lib/sleeper';
import { normalizePosition, getTier, computeTeamMode } from '@/lib/draft/context';
import type { DraftProfile, TrajectoryWindow, RosterProfile } from '@/lib/draft/context';
import { computeReportCard, type PoolPlayer, type RichRosterPlayer, type FranchiseWindow, type WindowComponents } from '@/lib/draft/reportCard';
import { getLeagueContext } from '@/lib/trajectory/contextLoader';
import { computeTeamTrajectoryForLeague } from '@/lib/trajectory/teamTrajectory';
import type { LeaguePhaseResult } from '@/lib/leaguePhase';
import { buildSleeperNameResolver } from '@/lib/sleeperNameResolver';
import { IDP_POSITION_VARIANTS, toIdpPosition, buildIdpSeedProjections, buildKickerSeedProjections, buildDefenseSeedProjections } from '@/lib/rankings/seedProjections';
import { buildLeagueConfig } from '@/lib/rankings/leagueConfigBuilder';
import { buildLeagueDefensiveAndKickerRankings } from '@/lib/rankings/defensiveEngine';
import { calculateAge, calculatePreciseAge, isPlausiblyActivePlayer } from '@/lib/calculateAge';

export const maxDuration = 45;

export async function GET(req: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const leagueId       = searchParams.get('leagueId');
    const sleeperDraftId = searchParams.get('sleeperDraftId');
    const myRosterId     = searchParams.get('myRosterId');

    if (!leagueId || !sleeperDraftId || !myRosterId) {
        return Response.json({ error: 'Missing params' }, { status: 400 });
    }

    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: { userId: true, leagueId: true, leagueType: true, rosterPositions: true, scoringType: true, scoringSettings: true, assignedPlanId: true, assignedPlanType: true, totalRosters: true },
    });

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const deny = await requireLeaguePaidAccess(session.user.id, league.assignedPlanId, league.assignedPlanType);
    if (deny) return deny;

    const myRosterIdNum  = parseInt(myRosterId, 10);
    const rosterPositions = league.rosterPositions as string[];
    const superflex = rosterPositions.includes('SUPER_FLEX');
    const isDynasty = league.leagueType === 'Dynasty';

    const [draft, allPicksRaw, rosters] = await Promise.all([
        getSleeperDraft(sleeperDraftId),
        getActiveDraftPicks(sleeperDraftId),
        getLeagueRosters(league.leagueId),
    ]);

    // Draft type
    const mySleeperRoster  = rosters.find(r => r.roster_id === myRosterIdNum);
    const mySleeperUserId  = mySleeperRoster?.owner_id ?? null;
    const leagueHasRosters = rosters.some(r => (r.players ?? []).length > 0);
    const draftType        = leagueHasRosters
        ? 'rookie'
        : (resolveDraftType(draft) === 'rookie' ? 'rookie' : 'startup');

    const totalTeams  = draft.settings.teams;
    const totalRounds = draft.settings.rounds;

    // All picks + my picks
    const sortedAllPicks = [...allPicksRaw].sort((a, b) => a.pick_no - b.pick_no);
    const myPicksRaw     = sortedAllPicks.filter(p => p.roster_id === myRosterIdNum);

    // ── Player pool ────────────────────────────────────────────────────────────
    const pool: PoolPlayer[] = [];

    if (draftType === 'rookie') {
        const rookies = await prisma.rookieRankingsPlayer.findMany({
            where:   { season: '2026' },
            orderBy: { fiqScore: 'desc' },
            select:  { playerName: true, position: true, fiqScore: true, fiqTier: true, opportunityScore: true, sleeperPlayerId: true },
        });

        // Broad fetch by position, not an exact-string match against FiQ's
        // own rookie names — a name-filtered query silently misses real
        // matches whenever the two sources spell a suffix differently (see
        // buildSleeperNameResolver's header).
        //
        // FiQ's own scouting position labels (e.g. "CB") don't always match
        // Sleeper's canonical IDP bucket (e.g. "DB") for the same real
        // player — widen via IDP_POSITION_VARIANTS, and always include every
        // stored sleeperPlayerId directly, so the position filter can never
        // cause a rookie's already-correct ID to go unfetched and silently
        // fall through to a same-named unrelated player (a real bug: Chris
        // Johnson the 2026 rookie CB was missed and either dropped or
        // resolved to the retired RB/an unrelated DB of the same name).
        const rookiePositions = [...new Set(rookies.map(r => r.position))];
        const widenedPositions = new Set(rookiePositions);
        for (const pos of rookiePositions) {
            for (const [bucket, variants] of Object.entries(IDP_POSITION_VARIANTS)) {
                if ((variants as string[]).includes(pos)) {
                    widenedPositions.add(bucket);
                    for (const v of variants) widenedPositions.add(v);
                }
            }
        }
        const storedRookieSleeperIds = rookies.map(r => r.sleeperPlayerId).filter((v): v is string => !!v);

        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where: {
                OR: [
                    { position: { in: [...widenedPositions] } },
                    { playerId: { in: storedRookieSleeperIds } },
                ],
            },
            select: { fullName: true, playerId: true, team: true, age: true, position: true },
        });
        const spResolver = buildSleeperNameResolver(sleeperPlayers);
        const spByPlayerId = new Map(sleeperPlayers.map(p => [p.playerId, p]));

        for (const r of rookies) {
            // Prefer the stored sleeperPlayerId (set at sync time) over a
            // name-based lookup — a name match can miss when the source's
            // spelling differs (e.g. a suffix Sleeper's fullName omits).
            const sp = (r.sleeperPlayerId ? spByPlayerId.get(r.sleeperPlayerId) : undefined)
                ?? spResolver(r.playerName, r.position);
            const fiqScore  = Math.round(r.fiqScore);
            const tierMatch = r.fiqTier?.match(/(\d+)/);
            const tier      = tierMatch ? parseInt(tierMatch[1], 10) : getTier(fiqScore);
            pool.push({
                sleeperPlayerId: sp?.playerId ?? '',
                playerName:      r.playerName,
                position:        r.position,
                team:            sp?.team ?? null,
                age:             sp?.age ?? null,
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
                select:  { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true, sleeperPlayerId: true },
            })
            : await prisma.fantasyCalcValue.findMany({
                where:   { dynastyValue: { gt: 300 } },
                orderBy: { dynastyValue: 'desc' },
                take:    500,
                select:  { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true, sleeperPlayerId: true },
            });

        // Broad fetch, not an exact-string match against FantasyCalc's own
        // playerName — a name-filtered query silently misses real matches
        // whenever the two sources spell a suffix differently (see
        // buildSleeperNameResolver's header).
        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { active: true },
            select: { fullName: true, playerId: true, team: true, age: true, position: true },
        });
        const spResolver = buildSleeperNameResolver(sleeperPlayers);
        const spByPlayerId = new Map(sleeperPlayers.map(p => [p.playerId, p]));

        for (const fcv of fcValues) {
            // Prefer the stored sleeperPlayerId (set at sync time) over a
            // name-based lookup — a name match can miss when the source's
            // spelling differs (e.g. a suffix Sleeper's fullName omits).
            const sp = (fcv.sleeperPlayerId ? spByPlayerId.get(fcv.sleeperPlayerId) : undefined)
                ?? spResolver(fcv.playerName, fcv.position);
            const dynastyValue = superflex ? fcv.dynastyValueSf : fcv.dynastyValue;
            const fiqScore = Math.min(100, Math.round(dynastyValue / 90));
            pool.push({
                sleeperPlayerId: sp?.playerId ?? '',
                playerName:      fcv.playerName,
                position:        fcv.position,
                team:            sp?.team ?? null,
                age:             sp?.age ?? null,
                fiqScore,
                tier:            getTier(fiqScore),
            });
        }
    }

    // ── Pre-draft full roster (for need calculation) ─────────────────────────
    const existingPlayerIds = (mySleeperRoster?.players ?? []).filter(id => id && id !== '0');
    const myPickPlayerIds   = myPicksRaw.map(p => p.player_id);

    const [existingPlayers, myPickSleeper] = await Promise.all([
        existingPlayerIds.length > 0
            ? prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: existingPlayerIds } },
                select: { playerId: true, position: true, fullName: true, age: true, birthDate: true },
            })
            : Promise.resolve([]),
        myPickPlayerIds.length > 0
            ? prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: myPickPlayerIds } },
                select: { playerId: true, position: true, fullName: true, age: true, birthDate: true },
            })
            : Promise.resolve([]),
    ]);

    const rosterFull = existingPlayers.map(p => ({ position: normalizePosition(p.position) }));

    // ── DraftProfile (TeamMode from pre-draft roster) ─────────────────────────
    const allRosterNames = [
        ...existingPlayers.map(p => p.fullName),
        ...myPickSleeper.map(p => p.fullName),
    ].filter((n): n is string => Boolean(n));

    const rosterFcValues = allRosterNames.length > 0
        ? await prisma.fantasyCalcValue.findMany({
            where:  { playerName: { in: allRosterNames } },
            select: { playerName: true, dynastyValue: true, dynastyValueSf: true },
        })
        : [];

    const fcByName = new Map(rosterFcValues.map(v => [v.playerName, v]));

    const toProfile = (p: { fullName?: string | null; position: string; age?: number | null }): RosterProfile => {
        const fc       = p.fullName ? fcByName.get(p.fullName) : undefined;
        const dynastyValue = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
        const fiqScore = dynastyValue != null ? Math.min(100, Math.round(dynastyValue / 90)) : null;
        return { position: normalizePosition(p.position), age: p.age ?? null, fiqScore };
    };

    // TeamMode from PRE-DRAFT roster only (not picks)
    const teamMode = computeTeamMode(existingPlayers.map(toProfile));

    // ── Trajectory ─────────────────────────────────────────────────────────────
    let trajectoryData: {
        window: string; horizonYears: number; overallScore: number; displayWindow: FranchiseWindow;
        components: WindowComponents; leagueAvg: WindowComponents;
    } | null = null;

    try {
        const currentYear = new Date().getFullYear();
        const minimalPhase: LeaguePhaseResult = {
            phase: 'PRE_DRAFT', activeRookieYear: currentYear,
            pickYears: [currentYear, currentYear + 1, currentYear + 2] as [number, number, number],
            useBucketedPicks: false, isWinNowWindow: false,
            missingSettings: false, currentWeek: 0,
            playoffWeekStart: null, champWeek: null,
        };

        const { context: leagueCtx, myTeamId } = await getLeagueContext(
            league.leagueId, mySleeperUserId, String(currentYear), isDynasty, superflex, minimalPhase,
        );

        const trajectoryMap = computeTeamTrajectoryForLeague(leagueCtx);
        const myTraj        = myTeamId ? trajectoryMap.get(myTeamId) : null;

        if (myTraj) {
            const winMap: Record<string, string> = {
                PEAKING_NOW: 'WIN_NOW', PEAK_AHEAD: 'ASCENDING',
                FALLING: 'REBUILD', FLAT: 'PLATEAU',
            };
            const modeOverride: Record<string, string> = {
                CONTENDER: 'WIN_NOW', REBUILDER: 'REBUILD', DECLINING: 'REBUILD',
            };
            const tw = (modeOverride[myTraj.mode] ?? winMap[myTraj.winCurve] ?? 'PLATEAU') as TrajectoryWindow;
            const horizonYears = tw === 'WIN_NOW' ? 1 : tw === 'ASCENDING' ? 2 : 3;
            // 5-state display window: split Aging (veteran, declining) out of Rebuild.
            const displayModeMap: Record<string, FranchiseWindow> = {
                CONTENDER: 'Contender', ASCENDING: 'Ascending', REBUILDER: 'Rebuild', DECLINING: 'Aging',
            };
            const displayCurveMap: Record<string, FranchiseWindow> = {
                PEAKING_NOW: 'Contender', PEAK_AHEAD: 'Ascending', FALLING: 'Aging', FLAT: 'Stable',
            };
            const displayWindow = displayModeMap[myTraj.mode] ?? displayCurveMap[myTraj.winCurve] ?? 'Stable';
            // League averages of each component → factual driver arrows (↑/→/↓).
            const allTraj = [...trajectoryMap.values()];
            const avgOf = (sel: (t: typeof allTraj[number]) => number) =>
                allTraj.length ? allTraj.reduce((s, t) => s + sel(t), 0) / allTraj.length : 0;
            const leagueAvg: WindowComponents = {
                starters: avgOf(t => t.starterQuality),
                age:      avgOf(t => t.rosterAge),
                picks:    avgOf(t => t.pickCapital),
            };
            trajectoryData = {
                window: tw, horizonYears, overallScore: myTraj.overallScore, displayWindow,
                components: { starters: myTraj.starterQuality, age: myTraj.rosterAge, picks: myTraj.pickCapital },
                leagueAvg,
            };
        }
    } catch (err) {
        // Non-fatal: report still renders, but the Roster Score shows "—" rather
        // than a misleading 50. Log so we can see when/why trajectory fails.
        captureError(err, { route: 'draft-report', step: 'trajectory', leagueId });
    }

    const trajectoryWindow: TrajectoryWindow = (trajectoryData?.window ?? 'PLATEAU') as TrajectoryWindow;
    const horizonYears = (trajectoryData?.horizonYears ?? 3) as 1 | 2 | 3;
    const riskTolerance = 'MEDIUM' as const;

    const draftProfile: DraftProfile = { teamMode, trajectoryWindow, horizonYears, riskTolerance };

    // ── Real K/DEF/IDP valuation (for franchise core strength) ────────────────
    // FantasyCalc never prices K/DEF/IDP (dynasty trade markets don't cover
    // them) — rosterRich below is built from FantasyCalcValue, so any real
    // kicker/defense/IDP on the roster would otherwise fall back to a flat,
    // meaningless neutral score regardless of who they actually are. Pull
    // real scores from the same defensive/kicker engine already used on
    // Rankings, Trade Evaluator, and the Live Draft Assistant — reused as-is,
    // gated to leagues that actually roster these positions.
    const IDP_SLOTS = new Set(['DL', 'LB', 'DB', 'IDP_FLEX']);
    const hasIDP    = rosterPositions.some(pos => IDP_SLOTS.has(pos));
    const hasKicker = rosterPositions.includes('K');
    const hasDEF    = rosterPositions.includes('DEF');

    const kdefFiqById = new Map<string, number>();
    if (hasIDP || hasKicker || hasDEF) {
        try {
            const myRosterPlayerIds = new Set([...existingPlayerIds, ...myPickPlayerIds]);
            const allPlayersRaw = await getPlayers();
            const enginePlayers: typeof allPlayersRaw = {};
            for (const [pid, player] of Object.entries(allPlayersRaw)) {
                const age = calculateAge(player.birthDate) ?? null;
                if (!isPlausiblyActivePlayer({ team: player.team, age, depthChartOrder: player.depthChartOrder, yearsExp: player.yearsExp })) continue;
                enginePlayers[pid] = player;
            }

            const rawDefScoring = (league.scoringSettings as Record<string, number> | null) ?? {};
            const { scoring: defScoring, lineup: defLineup } = buildLeagueConfig(
                rawDefScoring, rosterPositions, totalTeams,
            );

            const idpPlayersForSeed: { playerId: string; position: 'DL' | 'LB' | 'DB' }[] = [];
            const kickerIdsForSeed:  string[] = [];
            for (const [pid, player] of Object.entries(enginePlayers)) {
                const idpPos = toIdpPosition(player.position);
                if (idpPos) idpPlayersForSeed.push({ playerId: pid, position: idpPos });
                else if (player.position === 'K') kickerIdsForSeed.push(pid);
            }

            const idpProjections     = buildIdpSeedProjections(idpPlayersForSeed);
            const kickerProjections  = buildKickerSeedProjections(kickerIdsForSeed);
            const defenseProjections = buildDefenseSeedProjections();

            const defRankings = buildLeagueDefensiveAndKickerRankings(
                defScoring, defLineup, idpProjections, kickerProjections, defenseProjections,
                isDynasty ? 'Dynasty' : 'Redraft',
                {},
            );

            for (const entity of [...defRankings.kickers, ...defRankings.defenses, ...defRankings.idp]) {
                if (myRosterPlayerIds.has(entity.id)) {
                    kdefFiqById.set(entity.id, Math.max(1, Math.round(entity.valueScore)));
                }
            }
        } catch (err) {
            // Non-fatal: core strength falls back to the neutral default for
            // K/DEF/IDP rather than failing the whole report.
            captureError(err, { route: 'draft-report', step: 'kdef-valuation', leagueId });
        }
    }

    // ── Post-draft full roster (for franchise core strength) ─────────────────
    const allRosterIds = [
        ...existingPlayerIds,
        ...myPickPlayerIds,
    ];

    const rosterRich: RichRosterPlayer[] = [
        ...existingPlayers.map(p => {
            const fc       = p.fullName ? fcByName.get(p.fullName) : undefined;
            const dynastyValue = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
            const kdefFiq  = kdefFiqById.get(p.playerId);
            return {
                position:    normalizePosition(p.position),
                age:         p.age ?? null,
                preciseAge:  calculatePreciseAge(p.birthDate),
                fiqScore:    kdefFiq ?? (dynastyValue != null ? Math.min(100, Math.round(dynastyValue / 90)) : 50),
                rawValue:    dynastyValue ?? 0,
                playerName:  p.fullName ?? null,
                isDraftPick: false,
            };
        }),
        ...myPickSleeper.map(p => {
            const poolPlayer = pool.find(pp => pp.sleeperPlayerId === p.playerId);
            const fc         = p.fullName ? fcByName.get(p.fullName) : undefined;
            const dynastyValue   = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
            const kdefFiq        = kdefFiqById.get(p.playerId);
            return {
                position:    normalizePosition(p.position),
                age:         p.age ?? null,
                preciseAge:  calculatePreciseAge(p.birthDate),
                fiqScore:    kdefFiq ?? poolPlayer?.fiqScore ?? 50,
                rawValue:    dynastyValue ?? (poolPlayer ? poolPlayer.fiqScore * 90 : 0),
                playerName:  p.fullName ?? null,
                isDraftPick: true,
            };
        }),
    ];

    // ── Guard: no picks → return clear signal, not a fabricated report ────────
    if (myPicksRaw.length === 0) {
        return Response.json({ noPicks: true, totalPicks: sortedAllPicks.length });
    }

    // ── Build report card ──────────────────────────────────────────────────────
    const myPickInputs = myPicksRaw.map(p => ({
        pickOverall:     p.pick_no,
        round:           p.round,
        pickInRound:     ((p.pick_no - 1) % totalTeams) + 1,
        sleeperPlayerId: p.player_id,
    }));

    const allPickInputs = sortedAllPicks.map(p => ({
        pickOverall: p.pick_no,
        playerId:    p.player_id,
    }));

    const extraCorePositions: string[] = [
        ...(hasKicker ? ['K']   : []),
        ...(hasDEF    ? ['DEF'] : []),
        ...(hasIDP    ? ['IDP'] : []),
    ];
    // Real starter-slot counts for this league, not a generic guess — an
    // 11-IDP-slot league and a 1-IDP-flex league shouldn't share a depth bar.
    const coreDepthTargetOverrides: Record<string, number> = {
        K:   rosterPositions.filter(p => p === 'K').length || 1,
        DEF: rosterPositions.filter(p => p === 'DEF').length || 1,
        IDP: rosterPositions.filter(p => IDP_SLOTS.has(p)).length || 1,
    };

    const reportCard = computeReportCard({
        myPicks:      myPickInputs,
        allPicks:     allPickInputs,
        pool,
        rosterFull,
        rosterRich,
        extraCorePositions,
        coreDepthTargetOverrides,
        draftProfile,
        totalTeams,
        totalRounds,
        trajectoryData,
    });

    return Response.json({ reportCard });
}
