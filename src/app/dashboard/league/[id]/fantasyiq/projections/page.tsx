export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

import { notFound, redirect } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNflState, getLeagueUsers } from '@/lib/sleeper';
import { getEspnRosters, normalizeEspnLeague, type EspnNormalizedMatchup } from '@/lib/espn';
import {
    assembleTeamProjection,
    buildOpponentDefRankMap,
    winProbability,
    type RosterSlot,
    type PlayerRecord,
    type MatchupProjection,
} from '@/lib/projection-engine';
import MatchupProjections from '../../projections/MatchupProjections';
import HubTabBar          from '../HubTabBar';
import { computeRealProjectedPoints } from '@/lib/rankings/leagueScoringPoints';

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

                type EspnRosterName = { name: string; position: string };
                const teamStarterNames = new Map<number, EspnRosterName[]>();
                const teamAllNames     = new Map<number, EspnRosterName[]>();
                const teamInfoMap      = new Map<number, { name: string }>();

                for (const team of espnData.teams) {
                    teamStarterNames.set(team.teamId, team.roster.filter(p => !BENCH.has(p.lineupSlot)).map(p => ({ name: p.fullName, position: p.position })));
                    teamAllNames.set(team.teamId,     team.roster.map(p => ({ name: p.fullName, position: p.position })));
                    teamInfoMap.set(team.teamId,      { name: team.name });
                }

                const allNameSet = new Set<string>();
                for (const entries of teamAllNames.values()) for (const e of entries) allNameSet.add(e.name);
                const allNames = [...allNameSet];

                const sleeperRows = await prisma.sleeperPlayer.findMany({
                    where:  { fullName: { in: allNames } },
                    select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
                });

                // Some real players share an exact fullName (e.g. two "Justin Jefferson"s —
                // WR/MIN and LB/CLE). Resolve by name+position first (exact, then lowercase);
                // only fall back to a bare name match when that name is unambiguous.
                type SleeperRow = typeof sleeperRows[number];
                const byNamePos      = new Map<string, SleeperRow>();
                const byLowerNamePos = new Map<string, SleeperRow>();
                const byNameCount      = new Map<string, number>();
                const byName           = new Map<string, SleeperRow>();
                const byLowerNameCount = new Map<string, number>();
                const byLowerName      = new Map<string, SleeperRow>();
                for (const p of sleeperRows) {
                    const name  = p.fullName ?? '';
                    const lower = name.toLowerCase();
                    byNamePos.set(`${name}|${p.position}`, p);
                    byLowerNamePos.set(`${lower}|${p.position}`, p);
                    byNameCount.set(name, (byNameCount.get(name) ?? 0) + 1);
                    byName.set(name, p);
                    byLowerNameCount.set(lower, (byLowerNameCount.get(lower) ?? 0) + 1);
                    byLowerName.set(lower, p);
                }
                function resolveId(name: string, position: string): string | null {
                    const lower = name.toLowerCase();
                    const sp = byNamePos.get(`${name}|${position}`)
                        ?? byLowerNamePos.get(`${lower}|${position}`)
                        ?? (byNameCount.get(name) === 1 ? byName.get(name) : undefined)
                        ?? (byLowerNameCount.get(lower) === 1 ? byLowerName.get(lower) : undefined);
                    return sp?.playerId ?? null;
                }

                const allMatchedIds = sleeperRows.map(p => p.playerId);
                const espnScoringSettings = league.scoringSettings as Record<string, number> | null;

                const projs = await prisma.playerProjection.findMany({
                    where:  { season, week: espnWeek, playerId: { in: allMatchedIds } },
                    select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true, rawProjection: true },
                });
                const projByPlayer = new Map(projs.map(p => [
                    p.playerId,
                    computeRealProjectedPoints(
                        p.rawProjection as Record<string, number> | null,
                        espnScoringSettings,
                        p,
                        league.scoringType,
                    ),
                ]));

                const playerInfo = new Map<string, PlayerRecord>(
                    sleeperRows.map(p => [p.playerId, {
                        playerId: p.playerId, name: p.fullName,
                        position: p.position, team: p.team, injuryStatus: p.injuryStatus,
                    }])
                );

                type EspnStandingEntry = { teamId: number; fpts?: number };
                const espnStandings = (league.standings as EspnStandingEntry[] | null) ?? [];
                const standingsFpts = espnStandings.map(s => ({ rosterId: s.teamId, fpts: s.fpts ?? 0 }));
                const defRankMap    = buildOpponentDefRankMap(standingsFpts);
                const totalTeams    = league.totalRosters;

                function makeSlot(teamId: number, livePts: number): RosterSlot {
                    const toIds = (entries: EspnRosterName[]) => entries.map(e => resolveId(e.name, e.position)).filter(Boolean) as string[];
                    return {
                        rosterId: teamId,
                        teamName: teamInfoMap.get(teamId)?.name ?? `Team ${teamId}`,
                        username: undefined,
                        avatar:   null,
                        starters: toIds(teamStarterNames.get(teamId) ?? []),
                        players:  toIds(teamAllNames.get(teamId) ?? []),
                        livePts,
                        playerPts: {},
                    };
                }

                const espnMatchups: MatchupProjection[] = [];
                storedMatchup.matchups.forEach((m, i) => {
                    if (!m.awayTeamId) return;
                    const defA = defRankMap.get(m.awayTeamId) ?? Math.ceil(totalTeams / 2);
                    const defB = defRankMap.get(m.homeTeamId) ?? Math.ceil(totalTeams / 2);
                    const teamA = assembleTeamProjection(makeSlot(m.homeTeamId, m.homeScore), projByPlayer, playerInfo, defA, totalTeams);
                    const teamB = assembleTeamProjection(makeSlot(m.awayTeamId, m.awayScore), projByPlayer, playerInfo, defB, totalTeams);
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

    const [projections, players] = await Promise.all([
        prisma.playerProjection.findMany({
            where:  { season, week, playerId: { in: [...allPlayerIds] } },
            select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true, rawProjection: true },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: [...allPlayerIds] } },
            select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
        }),
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

    const standingsFpts = standings.map(s => ({ rosterId: s.rosterId, fpts: s.fpts ?? 0 }));
    const defRankMap    = buildOpponentDefRankMap(standingsFpts);
    const totalTeams    = league.totalRosters;
    const rosterPositions = (league.rosterPositions as string[]) ?? [];
    const starterSlotSet  = new Set(rosterPositions.filter(p => !BENCH_SLOTS.has(p)));
    void starterSlotSet;

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

        const makeSlot = (raw: SleeperMatchupFull): RosterSlot => ({
            rosterId: raw.roster_id,
            teamName: teamDisplayName(raw.roster_id),
            username: teamUsername(raw.roster_id),
            avatar:   teamAvatar(raw.roster_id),
            starters: (raw.starters ?? []).filter(pid => pid !== '0'),
            players:  raw.players ?? [],
            livePts:  raw.custom_points ?? raw.points,
            playerPts: raw.players_points ?? {},
        });

        const slotA = makeSlot(rawA);
        const slotB = makeSlot(rawB);

        const defRankForA = defRankMap.get(rawB.roster_id) ?? Math.ceil(totalTeams / 2);
        const defRankForB = defRankMap.get(rawA.roster_id) ?? Math.ceil(totalTeams / 2);

        const teamA  = assembleTeamProjection(slotA, projByPlayer, playerInfo, defRankForA, totalTeams);
        const teamB  = assembleTeamProjection(slotB, projByPlayer, playerInfo, defRankForB, totalTeams);
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
