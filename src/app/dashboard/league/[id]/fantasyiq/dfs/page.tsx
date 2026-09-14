export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

import { redirect, notFound } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { currentNflWeek, getDFSSlots, scorePlayersInLineup } from '@/lib/dfs';
import { getWeekLockTime, getNflSchedule } from '@/lib/sleeper';
import LineupBuilder  from '@/components/dfs/LineupBuilder';
import DFSLeaderboard from '@/components/dfs/DFSLeaderboard';

type DFSEntry = { slot: string; playerId: string };

// Past weeks' contests/lineups are never deleted (see page body) — this is
// just a plain link row, no client JS needed, so past scores stay reachable
// once the current week moves on instead of only ever showing "now".
function WeekNav({ leagueId, currentWeek, viewWeek }: { leagueId: string; currentWeek: number; viewWeek: number }) {
    const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
    return (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {weeks.map(w => (
                <a
                    key={w}
                    href={`/dashboard/league/${leagueId}/fantasyiq/dfs?week=${w}`}
                    className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border transition ${
                        w === viewWeek
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500'
                    }`}
                >
                    {w === 18 ? 'Pro Bowl' : `Wk ${w}`}
                </a>
            ))}
        </div>
    );
}

export default async function DFSChallengePage({
    params,
    searchParams,
}: {
    params:       Promise<{ id: string }>;
    searchParams: Promise<{ week?: string }>;
}) {
    const { id } = await params;
    const { week: weekParam } = await searchParams;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');
    const userId = session.user.id;

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id: true, userId: true, platform: true, leagueId: true,
            leagueName: true, season: true, rosterPositions: true, scoringType: true, draftType: true,
            scoringSettings: true,
        },
    });

    if (!league || league.userId !== userId) notFound();

    const { week: currentWeek, season } = await currentNflWeek();
    const contestSeason = parseInt(league.season, 10) || season;

    // Past weeks' contests/lineups are never deleted — only gated on which
    // week the page is currently viewing. Clamp so a stale/bad ?week= link
    // can't request a not-yet-played future week.
    const requestedWeek = weekParam ? parseInt(weekParam, 10) : currentWeek;
    const viewWeek = Number.isFinite(requestedWeek)
        ? Math.min(currentWeek, Math.max(1, requestedWeek))
        : currentWeek;
    const isCurrentWeek = viewWeek === currentWeek;
    const week = viewWeek;

    // Find or create contest — only ever CREATE for the current week; a past
    // week either already has a real contest or never ran one, and backdating
    // a placeholder for it would be meaningless.
    let contest = await prisma.dFSContest.findUnique({
        where: {
            platform_externalLeagueId_season_week: {
                platform:         league.platform,
                externalLeagueId: league.leagueId,
                season:           contestSeason,
                week,
            },
        },
    });

    if (isCurrentWeek) {
        if (!contest) {
            const lockAt = await getWeekLockTime(String(contestSeason), week);
            contest = await prisma.dFSContest.create({
                data: {
                    platform:         league.platform,
                    externalLeagueId: league.leagueId,
                    sourceLeagueId:   league.id,
                    season:           contestSeason,
                    week,
                    status:           'OPEN',
                    lockAt,
                },
            });
        } else if (!contest.lockAt) {
            const lockAt = await getWeekLockTime(String(contestSeason), week);
            contest = await prisma.dFSContest.update({ where: { id: contest.id }, data: { lockAt } });
        }
    }

    if (!contest) {
        return (
            <div className="space-y-6">
                <WeekNav leagueId={id} currentWeek={currentWeek} viewWeek={viewWeek} />
                <p className="text-gray-600 text-sm">No DFS contest was run for Week {viewWeek}.</p>
            </div>
        );
    }

    const now = new Date();
    // A past week is always treated as read-only/locked regardless of its
    // stored status — you can look back at what happened, not edit history.
    const isLocked = !isCurrentWeek || contest.status !== 'OPEN' || (!!contest.lockAt && now >= contest.lockAt);

    // Per-player game schedule: team → epoch ms of kickoff
    const gameSchedule = await getNflSchedule(String(contestSeason), week);

    const userLineup = await prisma.dFSLineup.findUnique({
        where:  { contestId_userId: { contestId: contest.id, userId } },
        select: { id: true, entriesJson: true, totalPoints: true, locked: true },
    });

    const leaderboard = await prisma.dFSLineup.findMany({
        where:   { contestId: contest.id },
        orderBy: { totalPoints: 'desc' },
        take:    50,
        select:  {
            id: true, totalPoints: true, entriesJson: true, locked: true,
            user: { select: { id: true, name: true } },
        },
    });

    // The leaderboard/lineup views only ever stored {slot, playerId} — never
    // a resolved name, so the UI had nothing to show but the raw ID. Resolve
    // every player appearing anywhere on this page in one batch, plus each
    // player's own real scored points (not just the lineup's lump total) so
    // "expand a lineup" actually shows who's in it and what they scored.
    const allEntries: DFSEntry[] = [
        ...(userLineup?.entriesJson as DFSEntry[] | undefined ?? []),
        ...leaderboard.flatMap(row => row.entriesJson as DFSEntry[]),
    ];
    const allPlayerIds = [...new Set(allEntries.map(e => e.playerId))];
    const [playerRows, pointsByPlayer] = await Promise.all([
        allPlayerIds.length > 0
            ? prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: allPlayerIds } },
                select: { playerId: true, fullName: true, position: true, team: true },
            })
            : Promise.resolve([]),
        scorePlayersInLineup(
            allEntries, contestSeason, week, league.scoringType,
            league.scoringSettings as Record<string, number> | null,
        ),
    ]);
    const playersById = Object.fromEntries(playerRows.map(p => [p.playerId, p]));
    const pointsById   = Object.fromEntries(pointsByPlayer);

    const dfsSlots = getDFSSlots(league.rosterPositions as string[]);

    const STATUS_LABELS: Record<string, string> = {
        OPEN:   'Open — submit your lineup',
        LOCKED: 'Locked — games in progress',
        FINAL:  'Final',
    };

    return (
        <div className="space-y-6">

            {/* Hub header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>

                </div>
            </div>

            {/* DFS content */}
            <div className="space-y-8">
                <WeekNav leagueId={id} currentWeek={currentWeek} viewWeek={viewWeek} />

                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-xl font-bold text-white">
                            {contest.week === 18 ? 'Pro Bowl Week' : `Week ${contest.week}`} DFS Challenge
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">{league.leagueName}</p>
                    </div>
                    <div className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${
                        !isCurrentWeek || contest.status === 'FINAL'
                            ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30'
                            : contest.status === 'OPEN'
                                ? 'bg-emerald-900/20 text-emerald-400 border-emerald-800'
                                : 'bg-amber-900/20 text-amber-400 border-amber-800'
                    }`}>
                        {isCurrentWeek ? (STATUS_LABELS[contest.status] ?? contest.status) : 'Final'}
                    </div>
                </div>

                <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-xs text-gray-500 leading-relaxed">
                    Free, no prizes. One lineup per week per member. Uses your league&apos;s scoring settings and roster template.
                    {isCurrentWeek && contest.status !== 'FINAL' && (
                        <span className="ml-1">Each player locks individually when their game kicks off — swap freely until then.</span>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <section className="space-y-3">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                            {userLineup ? 'Your Lineup' : 'Build Your Lineup'}
                            {userLineup && isCurrentWeek && contest.status !== 'FINAL' && (
                                <span className="ml-2 text-[10px] text-gray-500 font-normal normal-case">
                                    (swap players until their game starts)
                                </span>
                            )}
                        </h3>

                        {isCurrentWeek && contest.status !== 'FINAL' ? (
                            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                                <LineupBuilder
                                    contestId={contest.id}
                                    slots={dfsSlots}
                                    season={league.season}
                                    week={contest.week}
                                    leagueId={league.id}
                                    initialEntries={userLineup?.entriesJson as DFSEntry[] | undefined}
                                    gameSchedule={gameSchedule}
                                />
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-2">
                                {userLineup ? (
                                    <>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs text-gray-500">Your score</span>
                                            <span className="text-2xl font-black text-[#D4AF37] tabular-nums">
                                                {(userLineup.totalPoints).toFixed(2)} pts
                                            </span>
                                        </div>
                                        {(userLineup.entriesJson as DFSEntry[]).map((e, i) => {
                                            const p = playersById[e.playerId];
                                            return (
                                                <div key={i} className="flex items-center gap-3 text-xs border-b border-gray-800 pb-1.5">
                                                    <span className="text-[9px] text-gray-500 uppercase w-12 shrink-0">{e.slot}</span>
                                                    <span className="text-gray-300 flex-1 truncate">
                                                        {p ? p.fullName : e.playerId}
                                                        {p && <span className="text-gray-600 ml-1.5">{p.position} · {p.team ?? '—'}</span>}
                                                    </span>
                                                    <span className="text-gray-400 font-semibold shrink-0">
                                                        {(pointsById[e.playerId] ?? 0).toFixed(2)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </>
                                ) : (
                                    <p className="text-gray-600 text-sm">You didn&apos;t submit a lineup this week.</p>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                            Leaderboard
                            {leaderboard.length > 0 && (
                                <span className="ml-2 text-[10px] text-gray-500 font-normal normal-case">
                                    {leaderboard.length} lineup{leaderboard.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </h3>
                        <DFSLeaderboard
                            lineups={leaderboard}
                            myUserId={userId}
                            status={contest.status}
                            isLocked={isLocked}
                            players={playersById}
                            pointsByPlayer={pointsById}
                        />
                    </section>
                </div>
            </div>
        </div>
    );
}
