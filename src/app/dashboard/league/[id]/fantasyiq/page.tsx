export const dynamic   = 'force-dynamic';
export const maxDuration = 60;

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNflState, getLeagueUsers, getNflGameCompletion, getWeekOpponents } from '@/lib/sleeper';
import {
    assembleTeamProjection,
    winProbability,
    parseLineupRules,
    optimizeLineup,
    computeWaiverTargets,
    computeTradeInsights,
    computeRosterIntelligence,
    computeModifiers,
    positionVolatility,
    type RosterSlot,
    type PlayerProjectionRow,
    type TeamProjection,
    type MatchupProjection,
    type TeamLineupOptimization,
    type TeamWaiverAnalysis,
    type TeamTradeInsights,
    type RosterIntelligence,
} from '@/lib/projection-engine';
import { getDefenseRankByPosition, realDefRankFor } from '@/lib/rankings/defenseVsPosition';
import OptimizedLineups       from './OptimizedLineups';
import WaiverWireTargets      from './WaiverWireTargets';
import RosterIntelligencePanel from './RosterIntelligence';
import HubContent             from './HubContent';
import { buildWeeklyProjections } from '@/lib/rankings/weeklyProjections';

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
            scoringSettings:  true,
            faabRemaining:    true,
            currentMatchup:   true,
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
            const [rawMatchupsResult, leagueUsersResult, gameCompletionResult, opponentsResult, defenseRankingResult] = await Promise.allSettled([
                fetch(
                    `https://api.sleeper.app/v1/league/${league.leagueId}/matchups/${week}`,
                    { cache: 'no-store' },
                ).then(r => r.ok ? r.json() as Promise<SleeperMatchupFull[]> : Promise.resolve([] as SleeperMatchupFull[])),
                getLeagueUsers(league.leagueId),
                getNflGameCompletion(season, week),
                getWeekOpponents(season, week),
                getDefenseRankByPosition(season),
            ]);

            const rawMatchups: SleeperMatchupFull[] =
                rawMatchupsResult.status === 'fulfilled' ? rawMatchupsResult.value : [];
            const users =
                leagueUsersResult.status === 'fulfilled' ? leagueUsersResult.value : [];
            const gameCompletionByTeam =
                gameCompletionResult.status === 'fulfilled' ? gameCompletionResult.value : {};
            const opponentByTeam =
                opponentsResult.status === 'fulfilled' ? opponentsResult.value : {};
            const defenseRanking =
                defenseRankingResult.status === 'fulfilled' ? defenseRankingResult.value : { rankByTeamPosition: new Map(), totalByPosition: new Map() };

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

            const hubScoringSettings = league.scoringSettings as Record<string, number> | null;

            const { projByPlayer, playerInfo } = await buildWeeklyProjections({
                season, week,
                scoringSettings:   hubScoringSettings,
                scoringType:       league.scoringType,
                rosteredPlayerIds: allPlayerIds,
            });

            const BENCH_SLOTS_SLEEPER = new Set(['BN', 'IR']);
            const starterSlotArr = ((league.rosterPositions as string[]) ?? []).filter(p => !BENCH_SLOTS_SLEEPER.has(p));

            const pairs = new Map<number, SleeperMatchupFull[]>();
            for (const m of rawMatchups) {
                if (m.matchup_id === null) continue;
                if (!pairs.has(m.matchup_id)) pairs.set(m.matchup_id, []);
                pairs.get(m.matchup_id)!.push(m);
            }

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
                        rosterId:  raw.roster_id,
                        teamName:  teamDisplayName(raw.roster_id),
                        username:  teamUsername(raw.roster_id),
                        avatar:    teamAvatar(raw.roster_id),
                        starters:  starterIds,
                        starterSlots,
                        players:   raw.players ?? [],
                        livePts:   raw.custom_points ?? raw.points,
                        playerPts: raw.players_points ?? {},
                    };
                };

                const teamA = assembleTeamProjection(makeSlot(rawA), projByPlayer, playerInfo, opponentByTeam, defenseRanking, gameCompletionByTeam);
                const teamB = assembleTeamProjection(makeSlot(rawB), projByPlayer, playerInfo, opponentByTeam, defenseRanking, gameCompletionByTeam);

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
            const freeAgentRows: PlayerProjectionRow[] = [];

            for (const [pid, proj] of projByPlayer) {
                if (allPlayerIds.has(pid)) continue;
                const info = playerInfo.get(pid);
                if (!info) continue;
                const { rank: faDefRank, total: faDefTotal } = realDefRankFor(info.team, info.position, opponentByTeam, defenseRanking);
                const mods        = computeModifiers(info.injuryStatus, faDefRank, faDefTotal);
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
    } else if (league.platform === 'espn') {
        // ESPN requires per-user session cookies to call live, so — unlike
        // Sleeper's public API — this reads the cache the sync cron already
        // refreshes regularly, rather than calling ESPN directly from a page
        // render. Every roster player carries a pre-resolved sleeperPlayerId
        // (resolved at sync time), so everything downstream — projections,
        // the optimizer, IDP blending — is 100% platform-agnostic already.
        interface EspnStandingPlayer {
            name: string; position: string; lineupSlot: string; sleeperPlayerId: string | null;
            livePts?: number;
        }
        interface EspnStandingTeam {
            teamId: number; name: string; ownerName: string | null;
            fpts: number; players: EspnStandingPlayer[];
        }
        interface EspnCachedMatchup {
            homeTeamId: number; awayTeamId: number | null;
        }
        interface EspnCurrentMatchup {
            week: number;
            matchups: EspnCachedMatchup[];
        }

        const espnStandings  = (league.standings as EspnStandingTeam[] | null) ?? [];
        const currentMatchup = league.currentMatchup as EspnCurrentMatchup | null;

        if (!currentMatchup || espnStandings.length === 0) {
            offSeason = true;
        } else {
            week = currentMatchup.week;

            const allPlayerIds = new Set<string>();
            for (const t of espnStandings) {
                for (const p of t.players) {
                    if (p.sleeperPlayerId) allPlayerIds.add(p.sleeperPlayerId);
                }
            }

            const hubScoringSettings = league.scoringSettings as Record<string, number> | null;

            const [{ projByPlayer, playerInfo }, gameCompletionByTeam, opponentByTeam, defenseRanking] = await Promise.all([
                buildWeeklyProjections({
                    season, week,
                    scoringSettings:   hubScoringSettings,
                    scoringType:       league.scoringType,
                    rosteredPlayerIds: allPlayerIds,
                }),
                getNflGameCompletion(season, week),
                getWeekOpponents(season, week),
                getDefenseRankByPosition(season),
            ]);

            const teamById = new Map(espnStandings.map(t => [t.teamId, t]));

            const BENCH_SLOTS = new Set(['BN', 'IR']);
            const buildEspnTeam = (team: EspnStandingTeam): TeamProjection => {
                const resolved = team.players.filter(p => p.sleeperPlayerId);
                const playerPts: Record<string, number> = {};
                for (const p of resolved) {
                    if (p.livePts) playerPts[p.sleeperPlayerId!] = p.livePts;
                }
                const startingPlayers = resolved.filter(p => !BENCH_SLOTS.has(p.lineupSlot));
                const slot: RosterSlot = {
                    rosterId: team.teamId,
                    teamName: team.name,
                    username: team.ownerName ?? undefined,
                    avatar:   null,
                    starters: startingPlayers.map(p => p.sleeperPlayerId!),
                    starterSlots: startingPlayers.map(p => p.lineupSlot),
                    players:  resolved.map(p => p.sleeperPlayerId!),
                    livePts:  0,
                    playerPts,
                };
                return assembleTeamProjection(slot, projByPlayer, playerInfo, opponentByTeam, defenseRanking, gameCompletionByTeam);
            };

            const allTeams: TeamProjection[] = [];
            const pairedIds = new Set<number>();
            for (const m of currentMatchup.matchups) {
                const home = teamById.get(m.homeTeamId);
                const away = m.awayTeamId !== null ? teamById.get(m.awayTeamId) : undefined;
                if (home) {
                    pairedIds.add(home.teamId);
                    allTeams.push(buildEspnTeam(home));
                }
                if (away) {
                    pairedIds.add(away.teamId);
                    allTeams.push(buildEspnTeam(away));
                }
            }
            for (const t of espnStandings) {
                if (!pairedIds.has(t.teamId)) allTeams.push(buildEspnTeam(t));
            }

            const lineupRules = parseLineupRules(league.rosterPositions as string[]);
            const freeAgentRows: PlayerProjectionRow[] = [];
            for (const [pid, proj] of projByPlayer) {
                if (allPlayerIds.has(pid)) continue;
                const info = playerInfo.get(pid);
                if (!info) continue;
                const { rank: faDefRank, total: faDefTotal } = realDefRankFor(info.team, info.position, opponentByTeam, defenseRanking);
                const mods        = computeModifiers(info.injuryStatus, faDefRank, faDefTotal);
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
                scoringType={league.scoringType ?? 'std'}
                totalRosters={league.totalRosters}
                platform={league.platform ?? undefined}
                lineups={<OptimizedLineups optimizations={optimizations} offSeason={offSeason} />}
                waiver={<WaiverWireTargets  analyses={waiverAnalyses}     offSeason={offSeason} faabRemaining={league.faabRemaining as Record<string, number> | null} />}
                roster={<RosterIntelligencePanel intelligence={rosterIntelligence} offSeason={offSeason} />}
            />
        </>
    );
}
