export const maxDuration = 60;

import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getLeague, getLeagueUsers, getLeagueRosters, getPlayers, getTradedPicks,
    scoringLabel, summariseRosterPositions,
    type SleeperLeagueMember, type SleeperRoster,
} from '@/lib/sleeper';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import RosterCards, { type TeamRosterData } from './RosterCards';
import LeagueTradeEvaluator from './LeagueTradeEvaluator';

const BENCH_SLOTS = new Set(['BN', 'IR']);

function fpts(r: SleeperRoster) {
    return (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
}

function statusBadge(status: string) {
    switch (status) {
        case 'in_season':  return 'bg-green-900/40 text-green-400 border-green-800';
        case 'drafting':   return 'bg-blue-900/40 text-blue-400 border-blue-800';
        case 'pre_draft':  return 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
        default:           return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

function statusLabel(status: string) {
    switch (status) {
        case 'in_season':  return 'In Season';
        case 'drafting':   return 'Drafting';
        case 'pre_draft':  return 'Pre-Draft';
        case 'complete':   return 'Complete';
        default:           return status;
    }
}

export default async function LeagueDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where: { id },
        select: {
            id: true, userId: true, leagueId: true, leagueName: true,
            season: true, status: true, totalRosters: true, scoringType: true,
            avatar: true, rosterPositions: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    const [sleeperLeague, members, rosters, allPlayers, tradedPicks, dbUser, commSubForLeague] = await Promise.all([
        getLeague(league.leagueId),
        getLeagueUsers(league.leagueId),
        getLeagueRosters(league.leagueId),
        getPlayers(),
        getTradedPicks(league.leagueId),
        prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                sleeperUserId: true,
                connectedLeagues: { select: { leagueName: true } },
                subscriptions: {
                    where: { status: { in: ['active', 'trialing'] } },
                    orderBy: { createdAt: 'desc' },
                    select: { type: true, tier: true, leagueName: true },
                },
            },
        }),
        // Any active commissioner plan for this league (not just the current user's)
        // so all league members benefit from the commissioner's tier.
        prisma.subscription.findFirst({
            where: {
                type: 'commissioner',
                leagueName: { equals: league.leagueName, mode: 'insensitive' },
                status: { in: ['active', 'trialing'] },
            },
            select: { tier: true },
        }),
    ]);

    // Effective tier rules:
    // - Commissioner plan for this league applies to ALL members regardless of player plan.
    // - Player plan only applies (and can override commissioner) if the user has
    //   connected this league to their player plan (used a slot).
    // - If no player plan slot used, the member gets at most the commissioner tier.
    const activePlayerSub = dbUser?.subscriptions.find(s => s.type === 'player') ?? null;
    const playerTier = activePlayerSub?.tier ?? 'FREE';
    const leagueConnected = dbUser?.connectedLeagues.some(
        cl => cl.leagueName.toLowerCase() === league.leagueName.toLowerCase()
    ) ?? false;
    const effectiveTier = effectiveTierForLeague(
        playerTier,
        commSubForLeague?.tier ?? null,
        leagueConnected,
    );
    const effectiveLevel = tierLevel(effectiveTier); // 0=FREE 1=Pro 2=All-Pro 3=Elite
    const canUseTradeEvaluator = effectiveLevel >= 2; // All-Pro+

    const memberMap = new Map<string, SleeperLeagueMember>(members.map(m => [m.user_id, m]));

    const rows = rosters
        .map((roster) => {
            const member = roster.owner_id ? memberMap.get(roster.owner_id) : undefined;
            const teamName = member?.metadata?.team_name || member?.display_name || `Team ${roster.roster_id}`;
            return { roster, member, teamName, wins: roster.settings?.wins ?? 0, losses: roster.settings?.losses ?? 0, ties: roster.settings?.ties ?? 0, fpts: fpts(roster) };
        })
        .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
        .map((row, i) => ({ ...row, rank: i + 1 }));

    const rosterPositions = (league.rosterPositions as string[]) ?? sleeperLeague.roster_positions ?? [];
    const starterSlots = rosterPositions.filter(pos => !BENCH_SLOTS.has(pos));

    const neededIds = new Set<string>();
    for (const r of rosters) {
        for (const pid of r.players ?? []) neededIds.add(pid);
        for (const pid of r.starters ?? []) neededIds.add(pid);
    }
    neededIds.delete('0');

    const players: Record<string, typeof allPlayers[string]> = {};
    for (const pid of neededIds) { if (allPlayers[pid]) players[pid] = allPlayers[pid]; }

    // Build pick ownership per roster
    // Slot = reverse standings rank (worst record → slot 1, best record → slot n)
    const rosterIdToSlot = new Map(
        rows.map(row => [row.roster.roster_id, league.totalRosters - row.rank + 1])
    );
    const FUTURE_SEASONS = ['2026', '2027', '2028'];
    const ROUNDS = [1, 2, 3, 4, 5];
    const rosterIds = rosters.map(r => r.roster_id);

    function computeOwnedPicks(rosterId: number) {
        const owned: { season: string; round: number; slot: number }[] = [];
        for (const season of FUTURE_SEASONS) {
            for (const round of ROUNDS) {
                for (const origId of rosterIds) {
                    const traded = tradedPicks.find(
                        tp => tp.season === season && tp.round === round && tp.roster_id === origId
                    );
                    const currentOwner = traded ? traded.owner_id : origId;
                    if (currentOwner === rosterId) {
                        owned.push({ season, round, slot: rosterIdToSlot.get(origId) ?? 1 });
                    }
                }
            }
        }
        return owned;
    }

    // Build team data for the trade evaluator
    const teamTradeData = rows.map(row => ({
        rosterId:  row.roster.roster_id,
        teamName:  row.teamName,
        players:   (row.roster.players ?? [])
            .filter(pid => pid !== '0' && allPlayers[pid])
            .map(pid => ({
                name:     allPlayers[pid].full_name,
                position: allPlayers[pid].position,
                team:     allPlayers[pid].team,
            })),
        ownedPicks: computeOwnedPicks(row.roster.roster_id),
    }));

    const myTeamData  = teamTradeData.find(
        t => rosters.find(r => r.roster_id === t.rosterId)?.owner_id === dbUser?.sleeperUserId
    );
    const otherTeamsData = teamTradeData.filter(t => t.rosterId !== myTeamData?.rosterId);

    const teamRosters: TeamRosterData[] = rows.map(row => {
        const starterSet = new Set((row.roster.starters ?? []).filter(pid => pid !== '0'));
        const bench = (row.roster.players ?? []).filter(pid => !starterSet.has(pid));
        return {
            rosterId:    row.roster.roster_id,
            rank:        row.rank,
            teamName:    row.teamName,
            username:    row.member?.username,
            avatar:      row.member?.avatar,
            wins:        row.wins,
            losses:      row.losses,
            ties:        row.ties,
            fpts:        row.fpts,
            starters:    row.roster.starters ?? [],
            bench,
            starterSlots,
        };
    });

    const hasTies = rows.some(r => r.ties > 0);
    const hasPA   = rows.some(r => r.fpts > 0);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-8">

                <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                    ← Back to Dashboard
                </Link>

                {/* Header */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center gap-4 flex-wrap">
                        {league.avatar ? (
                            <Image src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                alt={league.leagueName} width={64} height={64} className="rounded-xl shrink-0" />
                        ) : (
                            <div className="w-16 h-16 rounded-xl bg-gray-800 shrink-0 flex items-center justify-center text-2xl font-bold text-gray-600">FF</div>
                        )}
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-bold truncate">{league.leagueName}</h1>
                            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-gray-400">
                                <span>{league.season} Season</span>
                                <span className="text-gray-700">·</span>
                                <span>{scoringLabel(league.scoringType ?? 'std')}</span>
                                <span className="text-gray-700">·</span>
                                <span>{league.totalRosters} Teams</span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(league.status)}`}>
                                    {statusLabel(league.status)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Standings */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800">
                        <h2 className="font-semibold text-lg">Standings</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-400 text-left border-b border-gray-800">
                                    <th className="px-6 py-3 font-medium w-12">#</th>
                                    <th className="px-4 py-3 font-medium">Team</th>
                                    <th className="px-4 py-3 font-medium text-center">W</th>
                                    <th className="px-4 py-3 font-medium text-center">L</th>
                                    {hasTies && <th className="px-4 py-3 font-medium text-center">T</th>}
                                    {hasPA && <th className="px-4 py-3 font-medium text-right pr-6">PF</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={row.roster.roster_id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
                                        <td className="px-6 py-4 text-gray-500 font-medium">{row.rank}</td>
                                        <td className="px-4 py-4">
                                            <a href={`#team-${row.roster.roster_id}`} className="flex items-center gap-3 group">
                                                {row.member?.avatar ? (
                                                    <Image src={`https://sleepercdn.com/avatars/thumbs/${row.member.avatar}`}
                                                        alt={row.teamName} width={28} height={28} className="rounded-full shrink-0" />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs font-bold text-gray-600">
                                                        {row.teamName[0]?.toUpperCase() ?? '?'}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-medium text-white group-hover:text-[#C8A951] transition">{row.teamName}</p>
                                                    {row.member && <p className="text-gray-600 text-xs">@{row.member.username}</p>}
                                                </div>
                                            </a>
                                        </td>
                                        <td className="px-4 py-4 text-center font-semibold text-white">{row.wins}</td>
                                        <td className="px-4 py-4 text-center text-gray-400">{row.losses}</td>
                                        {hasTies && <td className="px-4 py-4 text-center text-gray-500">{row.ties}</td>}
                                        {hasPA && <td className="px-4 py-4 text-right text-gray-300 pr-6">{row.fpts.toFixed(2)}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Rosters */}
                <div>
                    <h2 className="font-semibold text-lg mb-4">Team Rosters</h2>
                    <RosterCards teams={teamRosters} players={players} />
                </div>

                {/* League info */}
                <div className="grid sm:grid-cols-2 gap-6">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h2 className="font-semibold text-lg mb-4">Roster Slots</h2>
                        {rosterPositions.length > 0 ? (
                            <>
                                <p className="text-gray-300 text-sm leading-relaxed">{summariseRosterPositions(rosterPositions)}</p>
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {rosterPositions.map((pos, i) => (
                                        <span key={i} className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                            pos === 'BN' ? 'bg-gray-800 text-gray-500' :
                                            pos === 'IR' ? 'bg-red-900/30 text-red-500' :
                                            'bg-[#C8A951]/10 text-[#C8A951]'
                                        }`}>{pos}</span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-gray-600 text-sm">No roster data available.</p>
                        )}
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h2 className="font-semibold text-lg mb-4">League Settings</h2>
                        <dl className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Scoring</dt>
                                <dd className="text-gray-200 font-medium">{scoringLabel(league.scoringType ?? 'std')}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Teams</dt>
                                <dd className="text-gray-200 font-medium">{league.totalRosters}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Roster Size</dt>
                                <dd className="text-gray-200 font-medium">{rosterPositions.length > 0 ? rosterPositions.length : '—'}</dd>
                            </div>
                            {sleeperLeague.settings?.playoff_teams != null && (
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Playoff Teams</dt>
                                    <dd className="text-gray-200 font-medium">{sleeperLeague.settings.playoff_teams}</dd>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Type</dt>
                                <dd className="text-gray-200 font-medium">{sleeperLeague.settings?.type === 2 ? 'Dynasty' : 'Redraft'}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Platform</dt>
                                <dd className="text-gray-200 font-medium">Sleeper</dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Trade Evaluator */}
                <div>
                    <h2 className="font-semibold text-lg mb-4">Trade Evaluator</h2>
                    {canUseTradeEvaluator ? (
                        <LeagueTradeEvaluator
                            leagueName={league.leagueName}
                            scoringType={league.scoringType ?? null}
                            totalRosters={league.totalRosters}
                            leagueType={sleeperLeague.settings?.type === 2 ? 'Dynasty' : 'Redraft'}
                            myTeamData={myTeamData}
                            otherTeamsData={otherTeamsData}
                        />
                    ) : (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                            <p className="text-gray-400 text-sm mb-1">Trade Evaluator requires All-Pro or higher.</p>
                            <p className="text-gray-600 text-xs mb-4">
                                Upgrade your player plan, or the commissioner can upgrade their league plan —{' '}
                                and connect this league to your player plan to unlock it.
                            </p>
                            <a href="/pricing" className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm">
                                View Plans
                            </a>
                        </div>
                    )}
                </div>

            </div>
        </main>
    );
}
