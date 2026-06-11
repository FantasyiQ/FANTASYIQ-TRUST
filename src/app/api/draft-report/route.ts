// GET /api/draft-report?leagueId=...&sleeperDraftId=...&myRosterId=...
// Post-draft report card: pick alignment, tier distribution, franchise state.

import { type NextRequest } from 'next/server';
import { auth }   from '@/lib/auth';
import { requireLeaguePaidAccess } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import {
    getSleeperDraft,
    getActiveDraftPicks,
    getLeagueRosters,
    resolveDraftType,
} from '@/lib/sleeper';
import { normalizePosition, getTier, computeTeamMode } from '@/lib/draft/context';
import type { DraftProfile, TrajectoryWindow, RosterProfile } from '@/lib/draft/context';
import { computeReportCard, type PoolPlayer, type RichRosterPlayer } from '@/lib/draft/reportCard';
import { getLeagueContext } from '@/lib/trajectory/contextLoader';
import { computeTeamTrajectoryForLeague } from '@/lib/trajectory/teamTrajectory';
import type { LeaguePhaseResult } from '@/lib/leaguePhase';

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
        select: { userId: true, leagueId: true, leagueType: true, rosterPositions: true, scoringType: true, assignedPlanId: true, assignedPlanType: true },
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
            select:  { playerName: true, position: true, fiqScore: true, fiqTier: true, opportunityScore: true },
        });

        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { fullName: { in: rookies.map(r => r.playerName) } },
            select: { fullName: true, playerId: true, team: true, age: true },
        });
        const spByName = new Map(sleeperPlayers.map(p => [p.fullName, p]));

        for (const r of rookies) {
            const sp = spByName.get(r.playerName);
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
        const spByName = new Map(sleeperPlayers.map(p => [p.fullName, p]));

        for (const fcv of fcValues) {
            const sp       = spByName.get(fcv.playerName);
            const ktcValue = superflex ? fcv.dynastyValueSf : fcv.dynastyValue;
            const fiqScore = Math.min(100, Math.round(ktcValue / 90));
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
                select: { playerId: true, position: true, fullName: true, age: true },
            })
            : Promise.resolve([]),
        myPickPlayerIds.length > 0
            ? prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: myPickPlayerIds } },
                select: { playerId: true, position: true, fullName: true, age: true },
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
        const ktcValue = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
        const fiqScore = ktcValue != null ? Math.min(100, Math.round(ktcValue / 90)) : null;
        return { position: normalizePosition(p.position), age: p.age ?? null, fiqScore };
    };

    // TeamMode from PRE-DRAFT roster only (not picks)
    const teamMode = computeTeamMode(existingPlayers.map(toProfile));

    // ── Trajectory ─────────────────────────────────────────────────────────────
    let trajectoryData: { window: string; horizonYears: number; overallScore: number } | null = null;

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
            trajectoryData = { window: tw, horizonYears, overallScore: myTraj.overallScore };
        }
    } catch { /* non-critical */ }

    const trajectoryWindow: TrajectoryWindow = (trajectoryData?.window ?? 'PLATEAU') as TrajectoryWindow;
    const horizonYears = (trajectoryData?.horizonYears ?? 3) as 1 | 2 | 3;
    const riskTolerance = 'MEDIUM' as const;

    const draftProfile: DraftProfile = { teamMode, trajectoryWindow, horizonYears, riskTolerance };

    // ── Post-draft full roster (for franchise core strength) ─────────────────
    const allRosterIds = [
        ...existingPlayerIds,
        ...myPickPlayerIds,
    ];

    const rosterRich: RichRosterPlayer[] = [
        ...existingPlayers.map(p => {
            const fc       = p.fullName ? fcByName.get(p.fullName) : undefined;
            const ktcValue = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
            return {
                position:   normalizePosition(p.position),
                age:        p.age ?? null,
                fiqScore:   ktcValue != null ? Math.min(100, Math.round(ktcValue / 90)) : 50,
                rawValue:   ktcValue ?? 0,
                playerName: p.fullName ?? null,
                isDraftPick: false,
            };
        }),
        ...myPickSleeper.map(p => {
            const poolPlayer = pool.find(pp => pp.sleeperPlayerId === p.playerId);
            const fc         = p.fullName ? fcByName.get(p.fullName) : undefined;
            const ktcValue   = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
            return {
                position:   normalizePosition(p.position),
                age:        p.age ?? null,
                fiqScore:   poolPlayer?.fiqScore ?? 50,
                rawValue:   ktcValue ?? (poolPlayer ? poolPlayer.fiqScore * 90 : 0),
                playerName: p.fullName ?? null,
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

    const reportCard = computeReportCard({
        myPicks:      myPickInputs,
        allPicks:     allPickInputs,
        pool,
        rosterFull,
        rosterRich,
        draftProfile,
        totalTeams,
        totalRounds,
        trajectoryData,
    });

    return Response.json({ reportCard });
}
