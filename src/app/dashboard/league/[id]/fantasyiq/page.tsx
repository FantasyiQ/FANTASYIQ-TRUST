export const dynamic   = 'force-dynamic';
export const maxDuration = 60;

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNflState, getLeagueUsers } from '@/lib/sleeper';
import {
    assembleTeamProjection,
    buildOpponentDefRankMap,
    winProbability,
    parseLineupRules,
    optimizeLineup,
    computeWaiverTargets,
    computeTradeInsights,
    computeRosterIntelligence,
    computeModifiers,
    positionVolatility,
    type RosterSlot,
    type PlayerRecord,
    type PlayerProjectionRow,
    type MatchupProjection,
    type TeamLineupOptimization,
    type TeamWaiverAnalysis,
    type TeamTradeInsights,
    type RosterIntelligence,
} from '@/lib/projection-engine';
import OptimizedLineups       from './OptimizedLineups';
import WaiverWireTargets      from './WaiverWireTargets';
import TradeInsights          from './TradeInsights';
import RosterIntelligencePanel from './RosterIntelligence';
import HubContent             from './HubContent';

interface SleeperMatchupFull {
    matchup_id:     number | null;
    roster_id:      number;
    points:         number;
    custom_points:  number | null;
    starters:       string[];
    players:        string[];
    players_points: Record<string, number>;
}

export default async function FantasyiQHubPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id:               true,
            userId:           true,
            leagueId:         true,
            leagueName:       true,
            season:           true,
            scoringType:      true,
            totalRosters:     true,
            rosterPositions:  true,
            standings:        true,
            platform:         true,
            draftType:        true,
            assignedPlanType: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    let matchups:           MatchupProjection[]      = [];
    let optimizations:      TeamLineupOptimization[] = [];
    let waiverAnalyses:     TeamWaiverAnalysis[]     = [];
    let tradeInsights:      TeamTradeInsights[]      = [];
    let rosterIntelligence: RosterIntelligence[]     = [];
    let week      = 0;
    let season    = league.season;
    let offSeason = false;

    if (league.platform === 'sleeper') {
        const nflState = await getNflState();
        week   = nflState.week;
        season = nflState.season;
        const seasonType = (nflState as typeof nflState & { season_type: string }).season_type;

        if (seasonType === 'off' || week === 0) {
            offSeason = true;
        } else {
            const [rawMatchupsResult, leagueUsersResult] = await Promise.allSettled([
                fetch(
                    `https://api.sleeper.app/v1/league/${league.leagueId}/matchups/${week}`,
                    { cache: 'no-store' },
                ).then(r => r.ok ? r.json() as Promise<SleeperMatchupFull[]> : Promise.resolve([] as SleeperMatchupFull[])),
                getLeagueUsers(league.leagueId),
            ]);

            const rawMatchups: SleeperMatchupFull[] =
                rawMatchupsResult.status === 'fulfilled' ? rawMatchupsResult.value : [];
            const users =
                leagueUsersResult.status === 'fulfilled' ? leagueUsersResult.value : [];

            type StandingEntry = { rosterId: number; ownerId?: string | null; teamName?: string; fpts?: number };
            const standings   = (league.standings as StandingEntry[] | null) ?? [];
            const userMap     = new Map(users.map(u => [u.user_id, u]));
            const standingMap = new Map(standings.map(s => [s.rosterId, s]));

            const teamDisplayName = (rosterId: number): string => {
                const s = standingMap.get(rosterId);
                const m = s?.ownerId ? userMap.get(s.ownerId) : undefined;
                return s?.teamName || m?.metadata?.team_name || m?.display_name || `Team ${rosterId}`;
            };
            const teamAvatar   = (rosterId: number) =>
                standingMap.get(rosterId)?.ownerId
                    ? (userMap.get(standingMap.get(rosterId)!.ownerId!)?.avatar ?? null)
                    : null;
            const teamUsername = (rosterId: number) =>
                standingMap.get(rosterId)?.ownerId
                    ? userMap.get(standingMap.get(rosterId)!.ownerId!)?.username
                    : undefined;

            const allPlayerIds = new Set<string>();
            for (const m of rawMatchups) {
                for (const pid of [...(m.starters ?? []), ...(m.players ?? [])]) {
                    if (pid && pid !== '0') allPlayerIds.add(pid);
                }
            }

            const pprField: 'pointsPpr' | 'pointsStd' | 'pointsHalfPpr' =
                league.scoringType === 'ppr'      ? 'pointsPpr'     :
                league.scoringType === 'half_ppr' ? 'pointsHalfPpr' : 'pointsStd';

            const allProjections = await prisma.playerProjection.findMany({
                where:  { season, week },
                select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true },
            });
            const allProjectedIds = allProjections.map(p => p.playerId);
            const allPlayers = await prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: allProjectedIds } },
                select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
            });

            const projByPlayer = new Map(allProjections.map(p => [p.playerId, p[pprField]]));
            const playerInfo   = new Map<string, PlayerRecord>(
                allPlayers.map(p => [p.playerId, {
                    playerId:     p.playerId,
                    name:         p.fullName,
                    position:     p.position,
                    team:         p.team,
                    injuryStatus: p.injuryStatus,
                }])
            );

            const standingsFpts = standings.map(s => ({ rosterId: s.rosterId, fpts: s.fpts ?? 0 }));
            const defRankMap    = buildOpponentDefRankMap(standingsFpts);
            const totalTeams    = league.totalRosters;

            const pairs = new Map<number, SleeperMatchupFull[]>();
            for (const m of rawMatchups) {
                if (m.matchup_id === null) continue;
                if (!pairs.has(m.matchup_id)) pairs.set(m.matchup_id, []);
                pairs.get(m.matchup_id)!.push(m);
            }

            for (const [matchupId, pair] of pairs) {
                const [rawA, rawB] = pair;
                if (!rawA || !rawB) continue;

                const makeSlot = (raw: SleeperMatchupFull): RosterSlot => ({
                    rosterId:  raw.roster_id,
                    teamName:  teamDisplayName(raw.roster_id),
                    username:  teamUsername(raw.roster_id),
                    avatar:    teamAvatar(raw.roster_id),
                    starters:  (raw.starters ?? []).filter(pid => pid !== '0'),
                    players:   raw.players ?? [],
                    livePts:   raw.custom_points ?? raw.points,
                    playerPts: raw.players_points ?? {},
                });

                const defRankForA = defRankMap.get(rawB.roster_id) ?? Math.ceil(totalTeams / 2);
                const defRankForB = defRankMap.get(rawA.roster_id) ?? Math.ceil(totalTeams / 2);

                const teamA = assembleTeamProjection(makeSlot(rawA), projByPlayer, playerInfo, defRankForA, totalTeams);
                const teamB = assembleTeamProjection(makeSlot(rawB), projByPlayer, playerInfo, defRankForB, totalTeams);

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

            const lineupRules    = parseLineupRules(league.rosterPositions as string[]);
            const neutralDefRank = Math.ceil(totalTeams / 2);
            const freeAgentRows: PlayerProjectionRow[] = [];

            for (const [pid, proj] of projByPlayer) {
                if (allPlayerIds.has(pid)) continue;
                const info = playerInfo.get(pid);
                if (!info) continue;
                const mods        = computeModifiers(info.injuryStatus, neutralDefRank, totalTeams);
                const fiqProj     = Math.round(proj * (1 + mods.total) * 100) / 100;
                const baseRounded = Math.round(proj * 100) / 100;
                freeAgentRows.push({
                    playerId:      pid,
                    name:          info.name,
                    position:      info.position,
                    team:          info.team,
                    isStarter:     false,
                    injuryStatus:  info.injuryStatus,
                    livePts:       0,
                    baseProj:      baseRounded,
                    rosProj:       baseRounded,
                    fantasyIqProj: fiqProj,
                    projTotal:     fiqProj,
                    volatility:    positionVolatility(info.position),
                    modifiers:     mods,
                });
            }

            const allTeams = matchups.flatMap(m => [m.teamA, m.teamB]);

            for (const team of allTeams) {
                optimizations.push({
                    rosterId: team.rosterId,
                    teamName: team.teamName,
                    username: team.username,
                    result:   optimizeLineup(team.players, lineupRules),
                });
                waiverAnalyses.push(
                    computeWaiverTargets(
                        team.rosterId,
                        team.teamName,
                        team.username,
                        team.players,
                        freeAgentRows,
                        lineupRules,
                    )
                );
            }

            tradeInsights      = computeTradeInsights(allTeams, lineupRules);
            rosterIntelligence = computeRosterIntelligence(allTeams, optimizations, waiverAnalyses, tradeInsights);
        }
    } else {
        offSeason = true;
    }

    const isCommissionerPaid = league.assignedPlanType === 'commissioner';

    return (
        <>
            {isCommissionerPaid && (
                <div className="max-w-5xl mx-auto px-4 pt-4">
                    <div className="bg-[#D4AF37]/8 border border-[#D4AF37]/25 rounded-xl px-5 py-3 text-sm text-gray-300 flex flex-wrap gap-x-4 gap-y-1">
                        <span><span className="text-[#D4AF37] font-semibold">Commissioner Plan active.</span> All league members get access at no additional cost.</span>
                        <span className="text-gray-500">Members must join via your invite link. Player Plans are never required.</span>
                    </div>
                </div>
            )}
            <HubContent
                leagueId={id}
                week={week}
                season={season}
                lineups={<OptimizedLineups optimizations={optimizations} offSeason={offSeason} />}
                waiver={<WaiverWireTargets  analyses={waiverAnalyses}     offSeason={offSeason} />}
                trade={<TradeInsights       insights={tradeInsights}       offSeason={offSeason} />}
                roster={<RosterIntelligencePanel intelligence={rosterIntelligence} offSeason={offSeason} />}
            />
        </>
    );
}
