// GET /api/leagues/[leagueId]/matchup-projections
//
// leagueId param = DB League.id (primary key)
// Returns full matchup projection data for the current NFL week.

import { type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requireLeaguePaidAccess } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { getNflState, getLeagueMatchups, getLeagueUsers } from '@/lib/sleeper';
import {
    assembleTeamProjection,
    buildOpponentDefRankMap,
    winProbability,
    type RosterSlot,
    type PlayerRecord,
    type MatchupProjection,
} from '@/lib/projection-engine';

// Sleeper matchup response includes per-player points in live scoring
interface SleeperMatchupFull {
    matchup_id:    number | null;
    roster_id:     number;
    points:        number;
    custom_points: number | null;
    starters:      string[];
    players:       string[];
    players_points: Record<string, number>;  // playerId → live pts
    starters_points: number[];
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId: dbLeagueId } = await params;

    // ── 1. Load league from DB ─────────────────────────────────────────────────
    const league = await prisma.league.findUnique({
        where:  { id: dbLeagueId },
        select: {
            id:             true,
            userId:         true,
            leagueId:       true,
            season:         true,
            scoringType:    true,
            totalRosters:   true,
            standings:      true,
            platform:       true,
            assignedPlanId:   true,
            assignedPlanType: true,
        },
    });

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }

    const deny = await requireLeaguePaidAccess(session.user.id, league.assignedPlanId, league.assignedPlanType);
    if (deny) return deny;

    if (league.platform !== 'sleeper') {
        return Response.json({ error: 'Projections only available for Sleeper leagues' }, { status: 400 });
    }

    // ── 2. Current NFL week ────────────────────────────────────────────────────
    const nflState = await getNflState();
    const { week, season } = nflState;

    // ── 3. Fetch live matchup data from Sleeper ────────────────────────────────
    const [rawMatchups, leagueUsers] = await Promise.all([
        fetch(
            `https://api.sleeper.app/v1/league/${league.leagueId}/matchups/${week}`,
            { cache: 'no-store' },
        ).then(r => r.ok ? r.json() as Promise<SleeperMatchupFull[]> : Promise.resolve([] as SleeperMatchupFull[])),
        getLeagueUsers(league.leagueId),
    ]);

    if (!rawMatchups.length) {
        return Response.json({ error: 'No matchup data available', week, season }, { status: 404 });
    }

    // ── 4. Build member display name / avatar maps ─────────────────────────────
    type StandingEntry = { rosterId: number; ownerId?: string | null; teamName?: string; fpts?: number };
    const standings = (league.standings as StandingEntry[] | null) ?? [];

    const userMap = new Map(leagueUsers.map(u => [u.user_id, u]));
    const standingMap = new Map(standings.map(s => [s.rosterId, s]));

    function teamDisplayName(rosterId: number): string {
        const standing = standingMap.get(rosterId);
        const ownerId  = standing?.ownerId;
        const member   = ownerId ? userMap.get(ownerId) : undefined;
        return standing?.teamName || member?.metadata?.team_name || member?.display_name || `Team ${rosterId}`;
    }

    function teamAvatar(rosterId: number): string | null {
        const standing = standingMap.get(rosterId);
        const ownerId  = standing?.ownerId;
        const member   = ownerId ? userMap.get(ownerId) : undefined;
        return member?.avatar ?? null;
    }

    function teamUsername(rosterId: number): string | undefined {
        const standing = standingMap.get(rosterId);
        const ownerId  = standing?.ownerId;
        return ownerId ? userMap.get(ownerId)?.username : undefined;
    }

    // ── 5. Collect all player IDs on active rosters ────────────────────────────
    const allPlayerIds = new Set<string>();
    for (const m of rawMatchups) {
        for (const pid of [...m.starters, ...m.players]) {
            if (pid && pid !== '0') allPlayerIds.add(pid);
        }
    }

    // ── 6. Fetch projections + player info from DB in parallel ─────────────────
    const pprField: 'pointsPpr' | 'pointsStd' | 'pointsHalfPpr' =
        league.scoringType === 'ppr'      ? 'pointsPpr'     :
        league.scoringType === 'half_ppr' ? 'pointsHalfPpr' : 'pointsStd';

    const [projections, players] = await Promise.all([
        prisma.playerProjection.findMany({
            where: {
                season,
                week,
                playerId: { in: [...allPlayerIds] },
            },
            select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true },
        }),
        prisma.sleeperPlayer.findMany({
            where: { playerId: { in: [...allPlayerIds] } },
            select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
        }),
    ]);

    const projByPlayer = new Map(projections.map(p => [p.playerId, p[pprField]]));
    const playerInfo   = new Map<string, PlayerRecord>(
        players.map(p => [p.playerId, {
            playerId:     p.playerId,
            name:         p.fullName,
            position:     p.position,
            team:         p.team,
            injuryStatus: p.injuryStatus,
        }])
    );

    // ── 7. Build opponent defensive rank map from standings ────────────────────
    const standingsFpts = standings.map(s => ({ rosterId: s.rosterId, fpts: s.fpts ?? 0 }));
    const defRankMap    = buildOpponentDefRankMap(standingsFpts);
    const totalTeams    = league.totalRosters;

    // ── 8. Group matchups into pairs ───────────────────────────────────────────
    const pairs = new Map<number, SleeperMatchupFull[]>();
    for (const m of rawMatchups) {
        if (m.matchup_id === null) continue; // bye week
        if (!pairs.has(m.matchup_id)) pairs.set(m.matchup_id, []);
        pairs.get(m.matchup_id)!.push(m);
    }

    // ── 9. Assemble matchup projections ────────────────────────────────────────
    const matchups: MatchupProjection[] = [];

    for (const [matchupId, [rawA, rawB]] of pairs) {
        if (!rawA || !rawB) continue; // incomplete pair (bye)

        const slotA: RosterSlot = {
            rosterId:   rawA.roster_id,
            teamName:   teamDisplayName(rawA.roster_id),
            username:   teamUsername(rawA.roster_id),
            avatar:     teamAvatar(rawA.roster_id),
            starters:   rawA.starters ?? [],
            players:    rawA.players  ?? [],
            livePts:    rawA.custom_points ?? rawA.points,
            playerPts:  rawA.players_points ?? {},
        };

        const slotB: RosterSlot = {
            rosterId:   rawB.roster_id,
            teamName:   teamDisplayName(rawB.roster_id),
            username:   teamUsername(rawB.roster_id),
            avatar:     teamAvatar(rawB.roster_id),
            starters:   rawB.starters ?? [],
            players:    rawB.players  ?? [],
            livePts:    rawB.custom_points ?? rawB.points,
            playerPts:  rawB.players_points ?? {},
        };

        // Opponent def rank: team A plays against team B's defense, and vice versa
        const defRankForA = defRankMap.get(rawB.roster_id) ?? Math.ceil(totalTeams / 2);
        const defRankForB = defRankMap.get(rawA.roster_id) ?? Math.ceil(totalTeams / 2);

        const teamA = assembleTeamProjection(slotA, projByPlayer, playerInfo, defRankForA, totalTeams);
        const teamB = assembleTeamProjection(slotB, projByPlayer, playerInfo, defRankForB, totalTeams);

        const margin   = teamA.teamProjEnhanced - teamB.teamProjEnhanced;
        const winProbA = winProbability(margin, teamA.teamVariance, teamB.teamVariance);

        matchups.push({
            matchupId,
            week,
            teamA,
            teamB,
            winProbA:  Math.round(winProbA * 1000) / 1000,
            margin:    Math.round(margin * 100) / 100,
        });
    }

    // Sort by matchup ID for stable ordering
    matchups.sort((a, b) => a.matchupId - b.matchupId);

    // Strip internal modifier data before sending to client
    const sanitized = matchups.map(m => ({
        ...m,
        teamA: { ...m.teamA, players: m.teamA.players.map(({ modifiers: _m, ...p }) => p) },
        teamB: { ...m.teamB, players: m.teamB.players.map(({ modifiers: _m, ...p }) => p) },
    }));

    return Response.json({
        ok:         true,
        season,
        week,
        scoringType: league.scoringType,
        matchups:   sanitized,
    });
}
