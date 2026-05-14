export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getNflState,
    getLeagueUsers,
} from '@/lib/sleeper';
import {
    assembleTeamProjection,
    buildOpponentDefRankMap,
    winProbability,
    type RosterSlot,
    type PlayerRecord,
    type MatchupProjection,
} from '@/lib/projection-engine';
import MatchupProjections from './MatchupProjections';

// Sleeper matchup response with per-player points
interface SleeperMatchupFull {
    matchup_id:      number | null;
    roster_id:       number;
    points:          number;
    custom_points:   number | null;
    starters:        string[];
    players:         string[];
    players_points:  Record<string, number>;
}

const BENCH_SLOTS = new Set(['BN', 'IR']);

export default async function ProjectionsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    // ── Load league ────────────────────────────────────────────────────────────
    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id:             true,
            userId:         true,
            leagueId:       true,
            leagueName:     true,
            season:         true,
            scoringType:    true,
            totalRosters:   true,
            rosterPositions: true,
            standings:      true,
            platform:       true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    // ESPN leagues not supported yet
    if (league.platform !== 'sleeper') {
        return (
            <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-12 text-center">
                <p className="text-gray-400 text-sm font-semibold">Projections are only available for Sleeper leagues.</p>
                <p className="text-gray-600 text-xs mt-1">ESPN league projection support coming soon.</p>
            </div>
        );
    }

    // ── Current NFL week ───────────────────────────────────────────────────────
    const nflState = await getNflState();
    const { week, season, season_type } = nflState as typeof nflState & { season_type: string };

    // Off-season: no matchup data available
    if (season_type === 'off' || week === 0) {
        return (
            <MatchupProjections
                matchups={[]}
                week={0}
                season={season}
                scoringType={league.scoringType ?? null}
                offSeason
            />
        );
    }

    // ── Fetch live matchup data + users from Sleeper ───────────────────────────
    const [rawMatchupsResult, leagueUsers] = await Promise.allSettled([
        fetch(
            `https://api.sleeper.app/v1/league/${league.leagueId}/matchups/${week}`,
            { cache: 'no-store' },
        ).then(r => r.ok ? r.json() as Promise<SleeperMatchupFull[]> : Promise.resolve([] as SleeperMatchupFull[])),
        getLeagueUsers(league.leagueId),
    ]);

    const rawMatchups: SleeperMatchupFull[] =
        rawMatchupsResult.status === 'fulfilled' ? rawMatchupsResult.value : [];
    const users =
        leagueUsers.status === 'fulfilled' ? leagueUsers.value : [];

    // ── Build display name / avatar maps ──────────────────────────────────────
    type StandingEntry = { rosterId: number; ownerId?: string | null; teamName?: string; fpts?: number };
    const standings = (league.standings as StandingEntry[] | null) ?? [];

    const userMap    = new Map(users.map(u => [u.user_id, u]));
    const standingMap = new Map(standings.map(s => [s.rosterId, s]));

    function teamDisplayName(rosterId: number): string {
        const standing = standingMap.get(rosterId);
        const ownerId  = standing?.ownerId;
        const member   = ownerId ? userMap.get(ownerId) : undefined;
        return standing?.teamName || member?.metadata?.team_name || member?.display_name || `Team ${rosterId}`;
    }
    function teamAvatar(rosterId: number): string | null {
        const ownerId = standingMap.get(rosterId)?.ownerId;
        return ownerId ? (userMap.get(ownerId)?.avatar ?? null) : null;
    }
    function teamUsername(rosterId: number): string | undefined {
        const ownerId = standingMap.get(rosterId)?.ownerId;
        return ownerId ? userMap.get(ownerId)?.username : undefined;
    }

    // ── Collect all player IDs ─────────────────────────────────────────────────
    const allPlayerIds = new Set<string>();
    for (const m of rawMatchups) {
        for (const pid of [...(m.starters ?? []), ...(m.players ?? [])]) {
            if (pid && pid !== '0') allPlayerIds.add(pid);
        }
    }

    // ── Scoring field selection ────────────────────────────────────────────────
    const pprField: 'pointsPpr' | 'pointsStd' | 'pointsHalfPpr' =
        league.scoringType === 'ppr'      ? 'pointsPpr'     :
        league.scoringType === 'half_ppr' ? 'pointsHalfPpr' : 'pointsStd';

    // ── Fetch projections + player info ───────────────────────────────────────
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
            where:  { playerId: { in: [...allPlayerIds] } },
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

    // ── Defensive rank map ────────────────────────────────────────────────────
    const standingsFpts  = standings.map(s => ({ rosterId: s.rosterId, fpts: s.fpts ?? 0 }));
    const defRankMap     = buildOpponentDefRankMap(standingsFpts);
    const totalTeams     = league.totalRosters;
    const rosterPositions = (league.rosterPositions as string[]) ?? [];
    const starterSlotSet  = new Set(rosterPositions.filter(p => !BENCH_SLOTS.has(p)));

    // ── Group matchup pairs ───────────────────────────────────────────────────
    const pairs = new Map<number, SleeperMatchupFull[]>();
    for (const m of rawMatchups) {
        if (m.matchup_id === null) continue;
        if (!pairs.has(m.matchup_id)) pairs.set(m.matchup_id, []);
        pairs.get(m.matchup_id)!.push(m);
    }

    // ── Assemble matchup projections ──────────────────────────────────────────
    const matchups: MatchupProjection[] = [];

    for (const [matchupId, pair] of pairs) {
        const [rawA, rawB] = pair;
        if (!rawA || !rawB) continue;

        const makeSlot = (raw: SleeperMatchupFull): RosterSlot => ({
            rosterId:  raw.roster_id,
            teamName:  teamDisplayName(raw.roster_id),
            username:  teamUsername(raw.roster_id),
            avatar:    teamAvatar(raw.roster_id),
            starters:  (raw.starters ?? []).filter(pid => pid !== '0'),
            players:   raw.players  ?? [],
            livePts:   raw.custom_points ?? raw.points,
            playerPts: raw.players_points ?? {},
        });

        const slotA = makeSlot(rawA);
        const slotB = makeSlot(rawB);

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

    matchups.sort((a, b) => a.matchupId - b.matchupId);

    return (
        <MatchupProjections
            matchups={matchups}
            week={week}
            season={season}
            scoringType={league.scoringType ?? null}
        />
    );
}
