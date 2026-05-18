export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

import { redirect, notFound } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import HubTabBar  from '../HubTabBar';
import RookieDynastyRankings from './RookieDynastyRankings';
import PhaseDebugStrip from '@/components/dev/PhaseDebugStrip';
import TeamIntelligenceCard from '@/components/league/TeamIntelligenceCard';
import { getLeaguePhaseResult } from '@/lib/leaguePhase';
import type { LeaguePhaseResult } from '@/lib/leaguePhase';
import { getMyTeamSnapshot } from '@/lib/league/getMyTeamSnapshot';
import { getTeamTrajectory } from '@/lib/teamTrajectory';

export default async function DraftStrategyPage({
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
            id: true, userId: true, leagueName: true, season: true,
            rosterPositions: true, draftStatus: true, leagueType: true,
            playoffWeekStart: true, champWeek: true, platform: true,
            leagueId: true, totalRosters: true, sleeperUserId: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    const season = league.season ?? '2026';

    // ── Phase resolution ──────────────────────────────────────────────────────
    let currentWeek = 0;
    if (league.platform === 'sleeper') {
        try {
            const nflState = await getNflState();
            currentWeek = nflState.week ?? 0;
        } catch { /* keep 0 */ }
    }

    const phaseResult: LeaguePhaseResult = getLeaguePhaseResult({
        season,
        currentWeek,
        draftStatus:      league.draftStatus,
        playoffWeekStart: league.playoffWeekStart,
        champWeek:        league.champWeek,
    });

    // ── Team Trajectory ───────────────────────────────────────────────────────
    const isDynasty   = league.leagueType === 'Dynasty';
    const superflex   = (league.rosterPositions as string[]).includes('SUPER_FLEX');

    const dbUser = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { sleeperUserId: true },
    });
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;

    let trajectory = null;
    let myTeamName = 'My Team';
    if (league.platform === 'sleeper' && isDynasty) {
        try {
            const snapshot = await getMyTeamSnapshot(
                league.leagueId,
                mySleeperUserId,
                season,
                superflex,
                isDynasty,
            );
            if (snapshot) {
                trajectory = getTeamTrajectory({ ...snapshot, leagueSize: league.totalRosters ?? 12, leagueType: 'Dynasty', superflex, phaseResult });
            }
        } catch { /* Sleeper unreachable — skip trajectory */ }
    }

    // ── Position filtering ────────────────────────────────────────────────────
    const IDP_SLOTS = new Set(['DL','DE','DT','NT','LB','OLB','ILB','MLB','DB','CB','S','FS','SS','NB','IDP','IDPFLEX','IDP_FLEX']);
    const rosterPos = new Set(league.rosterPositions as string[]);
    const hasIDP    = [...rosterPos].some(pos => IDP_SLOTS.has(pos));
    const hasKicker = rosterPos.has('K');
    const IDP_PLAYER_POSITIONS = new Set(['DE','DT','NT','DL','EDGE','OLB','ILB','MLB','LB','CB','FS','SS','NB','S','DB','SAF']);

    // ── Rookie class to display ───────────────────────────────────────────────
    // Use the active rookie year from phase — but we can only show data we have seeded.
    // Fall back to the current season if no data exists for the active year.
    const targetSeason = String(phaseResult.activeRookieYear);
    const seasonHasData = await prisma.rookieRankingsPlayer.count({ where: { season: targetSeason } });
    const displaySeason = seasonHasData > 0 ? targetSeason : season;

    // ── Player fetch ──────────────────────────────────────────────────────────
    const rawPlayers = await prisma.rookieRankingsPlayer.findMany({
        where:   { season: displaySeason },
        orderBy: { fiqScore: 'desc' },
        select: {
            id:               true,
            playerName:       true,
            school:           true,
            position:         true,
            nflGrade:         true,
            fiqGrade:         true,
            eliteScore:       true,
            marketScore:      true,
            overallPick:      true,
            draftCap:         true,
            baseFiQScore:     true,
            opportunityScore: true,
            fiqScore:         true,
            fiqTier:          true,
            height:           true,
            weight:           true,
            fortyTime:        true,
        },
    });

    // Enrich with Sleeper player data (image, team, height, weight)
    const names = rawPlayers.map(p => p.playerName);
    const sleeperPlayers = await prisma.sleeperPlayer.findMany({
        where:  { fullName: { in: names } },
        select: { fullName: true, playerId: true, position: true, team: true, height: true, weight: true, age: true },
    });

    // Build two-level map: name → position → player. When there are multiple
    // Sleeper players with the same name (e.g. two "Chris Johnson"), prefer the
    // one whose position matches the rookie's position.
    const sleeperByNamePos = new Map<string, Map<string, typeof sleeperPlayers[0]>>();
    for (const sp of sleeperPlayers) {
        if (!sleeperByNamePos.has(sp.fullName)) sleeperByNamePos.set(sp.fullName, new Map());
        sleeperByNamePos.get(sp.fullName)!.set(sp.position ?? '', sp);
    }

    const players = rawPlayers
        .filter(p => {
            if (IDP_PLAYER_POSITIONS.has(p.position) && !hasIDP) return false;
            if (p.position === 'K' && !hasKicker) return false;
            if (p.position === 'P') return false;
            return true;
        })
        .map(p => {
            const byPos = sleeperByNamePos.get(p.playerName);
            const sp = byPos?.get(p.position) ?? (byPos?.size === 1 ? byPos.values().next().value : undefined);
            return {
                ...p,
                playerId:  sp?.playerId ?? null,
                team:      sp?.team     ?? null,
                height:    sp?.height   ?? p.height    ?? null,
                weight:    sp?.weight   ?? p.weight    ?? null,
                age:       sp?.age      ?? null,
            };
        });

    // Show missing-settings warning only for Dynasty leagues that don't have playoff week data
    const showSettingsAlert = isDynasty && phaseResult.missingSettings;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>
                </div>
            </div>

            <HubTabBar leagueId={id} activeTab="draft-strategy" />

            <PhaseDebugStrip phase={phaseResult} />

            {showSettingsAlert && (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-5 py-3.5 flex items-start gap-3">
                    <span className="text-amber-400 text-lg shrink-0">⚠</span>
                    <div>
                        <p className="text-amber-300 text-sm font-semibold">Playoff schedule not configured</p>
                        <p className="text-amber-400/70 text-xs mt-0.5">
                            Your league&apos;s playoff start week and championship week weren&apos;t found in Sleeper.
                            A commissioner can set them manually in Commissioner → Settings to enable accurate phase-aware pick values.
                        </p>
                    </div>
                </div>
            )}

            {trajectory && (
                <TeamIntelligenceCard
                    trajectory={trajectory}
                    teamName={myTeamName}
                />
            )}

            <RookieDynastyRankings
                players={players}
                season={displaySeason}
                hasIDP={hasIDP}
                phaseResult={phaseResult}
            />
        </div>
    );
}
