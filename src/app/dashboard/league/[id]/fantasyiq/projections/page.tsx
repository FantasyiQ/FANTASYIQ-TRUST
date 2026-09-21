export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

import { notFound, redirect } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNflState, getLeagueUsers, getNflGameCompletion, getWeekOpponents } from '@/lib/sleeper';
import { getEspnRosters, normalizeEspnLeague, type EspnNormalizedMatchup } from '@/lib/espn';
import {
    assembleTeamProjection,
    winProbability,
    type RosterSlot,
    type PlayerRecord,
    type MatchupProjection,
} from '@/lib/projection-engine';
import MatchupProjections from '../../projections/MatchupProjections';
import HubTabBar          from '../HubTabBar';
import { computeRealProjectedPoints } from '@/lib/rankings/leagueScoringPoints';
import { buildSleeperNameResolver } from '@/lib/sleeperNameResolver';
import { getDefenseRankByPosition } from '@/lib/rankings/defenseVsPosition';

interface SleeperMatchupFull {
    matchup_id:     number | null;
    roster_id:      number;
    points:         number;
    custom_points:  number | null;
    starters:       string[];
    players:        string[];
    players_points: Record<string, number>;
}

const BENCH_SLOTS = new Set(['BN', 'IR']);

export default async function HubProjectionsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id: true, userId: true, leagueId: true, leagueName: true,
            season: true, scoringType: true, totalRosters: true,
            rosterPositions: true, standings: true, platform: true,
            currentMatchup: true, scoringSettings: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    if (league.platform !== 'sleeper' && league.platform !== 'espn') {
        redirect(`/dashboard/league/${id}/fantasyiq`);
    }

    // ── ESPN projections branch ───────────────────────────────────────────────
    if (league.platform === 'espn') {
        const season = league.season ?? '2026';
        const header = (
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>
                </div>
            </div>
        );

        const storedMatchup = league.currentMatchup as { week: number; matchups: EspnNormalizedMatchup[] } | null;

        if (!storedMatchup || storedMatchup.week === 0 || !storedMatchup.matchups?.length) {
            return (
                <div className="space-y-6">
                    {header}
                    <HubTabBar leagueId={id} activeTab="projections" hideProjections={false} />
                    <MatchupProjections matchups={[]} week={0} season={season} scoringType={league.scoringType ?? null} offSeason />
                </div>
            );
        }

        const espnWeek = storedMatchup.week;

        const dbUser = await prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { espnS2: true, swid: true },
        });

        const noCredentials = !dbUser?.espnS2 || !dbUser?.swid;
        if (!noCredentials) {
            try {
                const rawEspn = await getEspnRosters(
                    league.leagueId,
                    parseInt(season),
                    dbUser!.espnS2!,
                    dbUser!.swid!,
                );
                const espnData = normalizeEspnLeague(rawEspn, league.leagueId);

                const BENCH = new Set(['BN', 'IR']);

                type EspnRosterName = { name: string; position: string; livePoints: number; lineupSlot: string };
                const teamStarterNames = new Map<number, EspnRosterName[]>();
                const teamAllNames     = new Map<number, EspnRosterName[]>();
                const teamInfoMap      = new Map<number, { name: string }>();

                for (const team of espnData.teams) {
                    teamStarterNames.set(team.teamId, team.roster.filter(p => !BENCH.has(p.lineupSlot)).map(p => ({ name: p.fullName, position: p.position, livePoints: p.livePoints, lineupSlot: p.lineupSlot })));
                    teamAllNames.set(team.teamId,     team.roster.map(p => ({ name: p.fullName, position: p.position, livePoints: p.livePoints, lineupSlot: p.lineupSlot })));
                    teamInfoMap.set(team.teamId,      { name: team.name });
                }

                // Fetch candidates broadly (all active players) rather than
                // pre-filtering by ESPN's own name strings — ESPN names team
                // defenses "<Nickname> D/ST" while Sleeper stores the full
                // team name ("Baltimore Ravens"), so an exact-name pre-filter
                // silently drops every DEF before the resolver ever runs.
                const sleeperRows = await prisma.sleeperPlayer.findMany({
                    where:  { active: true },
                    select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
                });
                const resolver = buildSleeperNameResolver(sleeperRows);
                function resolveId(name: string, position: string): string | null {
                    return resolver(name, position)?.playerId ?? null;
                }

                const resolvedIdSet = new Set<string>();
                for (const entries of teamAllNames.values()) {
                    for (const e of entries) {
                        const pid = resolveId(e.name, e.position);
                        if (pid) resolvedIdSet.add(pid);
                    }
                }
                const allMatchedIds = [...resolvedIdSet];
                const espnScoringSettings = league.scoringSettings as Record<string, number> | null;

                const [projs, gameCompletionByTeam, opponentByTeam, defenseRanking] = await Promise.all([
                    prisma.playerProjection.findMany({
                        where:  { season, week: espnWeek, playerId: { in: allMatchedIds } },
                        select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true, rawProjection: true },
                    }),
                    getNflGameCompletion(season, espnWeek),
                    getWeekOpponents(season, espnWeek),
                    getDefenseRankByPosition(season),
                ]);
                const projByPlayer = new Map(projs.map(p => [
                    p.playerId,
                    computeRealProjectedPoints(
                        p.rawProjection as Record<string, number> | null,
                        espnScoringSettings,
                        p,
                        league.scoringType,
                    ),
                ]));

                const sleeperById = new Map(sleeperRows.map(p => [p.playerId, p]));
                const playerInfo = new Map<string, PlayerRecord>(
                    allMatchedIds.map(pid => {
                        const p = sleeperById.get(pid)!;
                        return [pid, {
                            playerId: p.playerId, name: p.fullName,
                            position: p.position, team: p.team, injuryStatus: p.injuryStatus,
                        }];
                    })
                );

                function makeSlot(teamId: number, livePts: number): RosterSlot {
                    const toIds = (entries: EspnRosterName[]) => entries.map(e => resolveId(e.name, e.position)).filter(Boolean) as string[];
                    const allEntries = teamAllNames.get(teamId) ?? [];
                    const playerPts: Record<string, number> = {};
                    for (const e of allEntries) {
                        if (!e.livePoints) continue;
                        const pid = resolveId(e.name, e.position);
                        if (pid) playerPts[pid] = e.livePoints;
                    }
                    const starterIds: string[] = [];
                    const starterSlots: string[] = [];
                    for (const e of teamStarterNames.get(teamId) ?? []) {
                        const pid = resolveId(e.name, e.position);
                        if (!pid) continue;
                        starterIds.push(pid);
                        starterSlots.push(e.lineupSlot);
                    }
                    return {
                        rosterId: teamId,
                        teamName: teamInfoMap.get(teamId)?.name ?? `Team ${teamId}`,
                        username: undefined,
                        avatar:   null,
                        starters: starterIds,
                        starterSlots,
                        players:  toIds(allEntries),
                        livePts,
                        playerPts,
                    };
                }

                const espnMatchups: MatchupProjection[] = [];
                storedMatchup.matchups.forEach((m, i) => {
                    if (!m.awayTeamId) return;
                    const teamA = assembleTeamProjection(makeSlot(m.homeTeamId, m.homeScore), projByPlayer, playerInfo, opponentByTeam, defenseRanking, gameCompletionByTeam);
                    const teamB = assembleTeamProjection(makeSlot(m.awayTeamId, m.awayScore), projByPlayer, playerInfo, opponentByTeam, defenseRanking, gameCompletionByTeam);
                    const margin = teamA.teamProjEnhanced - teamB.teamProjEnhanced;
                    espnMatchups.push({
                        matchupId: i + 1,
                        week:      espnWeek,
                        teamA,
                        teamB,
                        winProbA:  Math.round(winProbability(margin, teamA.teamVariance, teamB.teamVariance) * 1000) / 1000,
                        margin:    Math.round(margin * 100) / 100,
                    });
                });

                return (
                    <div className="space-y-6">
                        {header}
                        <HubTabBar leagueId={id} activeTab="projections" hideProjections={false} />
                        <MatchupProjections
                            matchups={espnMatchups}
                            week={espnWeek}
                            season={season}
                            scoringType={league.scoringType ?? null}
                        />
                    </div>
                );
            } catch { /* fall through to reconnect message */ }
        }

        return (
            <div className="space-y-6">
                {header}
                <HubTabBar leagueId={id} activeTab="projections" hideProjections={false} />
                <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-12 text-center space-y-2">
                    <p className="text-gray-400 text-sm font-semibold">Could not load ESPN roster data.</p>
                    <p className="text-gray-600 text-xs">Your ESPN credentials may have expired. Try reconnecting your ESPN account from the sync page.</p>
                </div>
            </div>
        );
    }

    // ── Sleeper branch ────────────────────────────────────────────────────────
    const nflState = await getNflState();
    const { week, season, season_type } = nflState as typeof nflState & { season_type: string };

    const header = (
        <div className="flex items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
            </div>
            <div className="shrink-0 text-right">
                <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>
            </div>
        </div>
    );

    if (season_type === 'off' || week === 0) {
        return (
            <div className="space-y-6">
                {header}
                <HubTabBar leagueId={id} activeTab="projections" hideProjections={false} />
                <MatchupProjections matchups={[]} week={0} season={season} scoringType={league.scoringType ?? null} offSeason />
            </div>
        );
    }

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

    type StandingEntry = { rosterId: number; ownerId?: string | null; teamName?: string; fpts?: number };
    const standings   = (league.standings as StandingEntry[] | null) ?? [];
    const userMap     = new Map(users.map(u => [u.user_id, u]));
    const standingMap = new Map(standings.map(s => [s.rosterId, s]));

    function teamDisplayName(rosterId: number) {
        const standing = standingMap.get(rosterId);
        const ownerId  = standing?.ownerId;
        const member   = ownerId ? userMap.get(ownerId) : undefined;
        return standing?.teamName || member?.metadata?.team_name || member?.display_name || `Team ${rosterId}`;
    }
    function teamAvatar(rosterId: number) {
        const ownerId = standingMap.get(rosterId)?.ownerId;
        return ownerId ? (userMap.get(ownerId)?.avatar ?? null) : null;
    }
    function teamUsername(rosterId: number) {
        const ownerId = standingMap.get(rosterId)?.ownerId;
        return ownerId ? userMap.get(ownerId)?.username : undefined;
    }

    const allPlayerIds = new Set<string>();
    for (const m of rawMatchups) {
        for (const pid of [...(m.starters ?? []), ...(m.players ?? [])]) {
            if (pid && pid !== '0') allPlayerIds.add(pid);
        }
    }

    const sleeperScoringSettings = league.scoringSettings as Record<string, number> | null;

    const [projections, players, gameCompletionByTeam, opponentByTeam, defenseRanking] = await Promise.all([
        prisma.playerProjection.findMany({
            where:  { season, week, playerId: { in: [...allPlayerIds] } },
            select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true, rawProjection: true },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: [...allPlayerIds] } },
            select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
        }),
        getNflGameCompletion(season, week),
        getWeekOpponents(season, week),
        getDefenseRankByPosition(season),
    ]);

    const projByPlayer = new Map(projections.map(p => [
        p.playerId,
        computeRealProjectedPoints(
            p.rawProjection as Record<string, number> | null,
            sleeperScoringSettings,
            p,
            league.scoringType,
        ),
    ]));
    const playerInfo   = new Map<string, PlayerRecord>(
        players.map(p => [p.playerId, {
            playerId: p.playerId, name: p.fullName,
            position: p.position, team: p.team, injuryStatus: p.injuryStatus,
        }])
    );

    const rosterPositions = (league.rosterPositions as string[]) ?? [];
    // Sleeper's `starters` array is index-aligned with the league's
    // non-bench roster_positions (that's how Sleeper itself defines a
    // "starter" slot) — zip them to get each starter's real slot label,
    // so the roster displays in QB/RB/RB/WR/WR/TE/FLEX/K/DEF order.
    const starterSlotArr = rosterPositions.filter(p => !BENCH_SLOTS.has(p));

    const pairs = new Map<number, SleeperMatchupFull[]>();
    for (const m of rawMatchups) {
        if (m.matchup_id === null) continue;
        if (!pairs.has(m.matchup_id)) pairs.set(m.matchup_id, []);
        pairs.get(m.matchup_id)!.push(m);
    }

    const matchups: MatchupProjection[] = [];
    for (const [matchupId, pair] of pairs) {
        const [rawA, rawB] = pair;
        if (!rawA || !rawB) continue;

        const makeSlot = (raw: SleeperMatchupFull): RosterSlot => {
            const starterIds: string[] = [];
            const starterSlots: string[] = [];
            (raw.starters ?? []).forEach((pid, i) => {
                if (pid === '0') return;
                starterIds.push(pid);
                starterSlots.push(starterSlotArr[i] ?? '');
            });
            return {
                rosterId: raw.roster_id,
                teamName: teamDisplayName(raw.roster_id),
                username: teamUsername(raw.roster_id),
                avatar:   teamAvatar(raw.roster_id),
                starters: starterIds,
                starterSlots,
                players:  raw.players ?? [],
                livePts:  raw.custom_points ?? raw.points,
                playerPts: raw.players_points ?? {},
            };
        };

        const slotA = makeSlot(rawA);
        const slotB = makeSlot(rawB);

        const teamA  = assembleTeamProjection(slotA, projByPlayer, playerInfo, opponentByTeam, defenseRanking, gameCompletionByTeam);
        const teamB  = assembleTeamProjection(slotB, projByPlayer, playerInfo, opponentByTeam, defenseRanking, gameCompletionByTeam);
        const margin = teamA.teamProjEnhanced - teamB.teamProjEnhanced;

        matchups.push({
            matchupId,
            week,
            teamA,
            teamB,
            winProbA: Math.round(winProbability(margin, teamA.teamVariance, teamB.teamVariance) * 1000) / 1000,
            margin:   Math.round(margin * 100) / 100,
        });
    }

    matchups.sort((a, b) => a.matchupId - b.matchupId);

    return (
        <div className="space-y-6">
            {header}
            <HubTabBar leagueId={id} activeTab="projections" hideProjections={false} />
            <MatchupProjections
                matchups={matchups}
                week={week}
                season={season}
                scoringType={league.scoringType ?? null}
            />
        </div>
    );
}
