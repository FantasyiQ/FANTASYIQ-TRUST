import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getLeague,
    getLeagueUsers,
    getLeagueRosters,
    scoringLabel,
    summariseRosterPositions,
    type SleeperLeagueMember,
    type SleeperRoster,
} from '@/lib/sleeper';

const LEAGUE_STATUS_STYLES: Record<string, string> = {
    in_season: 'bg-green-900/40 text-green-400 border-green-800',
    drafting:  'bg-blue-900/40 text-blue-400 border-blue-800',
    pre_draft: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    complete:  'bg-gray-800 text-gray-500 border-gray-700',
};

function leagueStatusLabel(status: string) {
    switch (status) {
        case 'in_season':  return 'In Season';
        case 'drafting':   return 'Drafting';
        case 'pre_draft':  return 'Pre-Draft';
        case 'complete':   return 'Complete';
        default:           return status;
    }
}

function fpts(roster: SleeperRoster): number {
    return (roster.settings?.fpts ?? 0) + (roster.settings?.fpts_decimal ?? 0) / 100;
}

function ppts(roster: SleeperRoster): number {
    return (roster.settings?.ppts ?? 0) + (roster.settings?.ppts_decimal ?? 0) / 100;
}

interface StandingsRow {
    rank: number;
    roster: SleeperRoster;
    member: SleeperLeagueMember | undefined;
    teamName: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
}

export default async function LeagueDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            leagueId: true,
            leagueName: true,
            season: true,
            status: true,
            totalRosters: true,
            scoringType: true,
            avatar: true,
            rosterPositions: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    // Fetch live Sleeper data in parallel
    const [sleeperLeague, members, rosters] = await Promise.all([
        getLeague(league.leagueId),
        getLeagueUsers(league.leagueId),
        getLeagueRosters(league.leagueId),
    ]);

    const memberMap = new Map<string, SleeperLeagueMember>(
        members.map((m) => [m.user_id, m])
    );

    // Build standings — rosters without an owner go to the end
    const rows: StandingsRow[] = rosters
        .map((roster) => {
            const member = roster.owner_id ? memberMap.get(roster.owner_id) : undefined;
            const teamName =
                member?.metadata?.team_name ||
                member?.display_name ||
                `Team ${roster.roster_id}`;
            return {
                rank: 0,
                roster,
                member,
                teamName,
                wins: roster.settings?.wins ?? 0,
                losses: roster.settings?.losses ?? 0,
                ties: roster.settings?.ties ?? 0,
                pointsFor: fpts(roster),
                pointsAgainst: ppts(roster),
            };
        })
        .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
        .map((row, i) => ({ ...row, rank: i + 1 }));

    const rosterPositions =
        (league.rosterPositions as string[] | null) ??
        sleeperLeague.roster_positions ??
        [];

    const currentScoringType = league.scoringType ?? 'std';
    const leagueSettings = sleeperLeague.settings;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Back */}
                <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                    ← Back to Dashboard
                </Link>

                {/* League header */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center gap-4 flex-wrap">
                        {league.avatar ? (
                            <Image
                                src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                alt={league.leagueName}
                                width={64}
                                height={64}
                                className="rounded-xl shrink-0"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-xl bg-gray-800 shrink-0 flex items-center justify-center text-2xl font-bold text-gray-600">
                                FF
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-bold truncate">{league.leagueName}</h1>
                            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-gray-400">
                                <span>{league.season} Season</span>
                                <span className="text-gray-700">·</span>
                                <span>{scoringLabel(currentScoringType)}</span>
                                <span className="text-gray-700">·</span>
                                <span>{league.totalRosters} Teams</span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${LEAGUE_STATUS_STYLES[league.status] ?? LEAGUE_STATUS_STYLES.complete}`}>
                                    {leagueStatusLabel(league.status)}
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
                                    {rows.some((r) => r.ties > 0) && (
                                        <th className="px-4 py-3 font-medium text-center">T</th>
                                    )}
                                    <th className="px-4 py-3 font-medium text-right">PF</th>
                                    {rows.some((r) => r.pointsAgainst > 0) && (
                                        <th className="px-4 py-3 font-medium text-right pr-6">PA</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const isMe = row.member?.user_id
                                        ? members.find(
                                              (m) =>
                                                  m.user_id === row.member?.user_id &&
                                                  m.is_owner
                                          )
                                        : false;
                                    const hasTies = rows.some((r) => r.ties > 0);
                                    const hasPA = rows.some((r) => r.pointsAgainst > 0);

                                    return (
                                        <tr
                                            key={row.roster.roster_id}
                                            className={`border-b border-gray-800/50 last:border-0 transition-colors ${
                                                isMe
                                                    ? 'bg-[#C8A951]/5 border-l-2 border-l-[#C8A951]'
                                                    : 'hover:bg-gray-800/20'
                                            }`}
                                        >
                                            <td className="px-6 py-4 text-gray-500 font-medium">{row.rank}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    {row.member?.avatar ? (
                                                        <Image
                                                            src={`https://sleepercdn.com/avatars/thumbs/${row.member.avatar}`}
                                                            alt={row.teamName}
                                                            width={28}
                                                            height={28}
                                                            className="rounded-full shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-7 h-7 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs font-bold text-gray-600">
                                                            {row.teamName[0]?.toUpperCase() ?? '?'}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className={`font-medium ${isMe ? 'text-[#C8A951]' : 'text-white'}`}>
                                                            {row.teamName}
                                                            {isMe && <span className="ml-2 text-xs text-[#C8A951]/70">(You)</span>}
                                                        </p>
                                                        {row.member && (
                                                            <p className="text-gray-600 text-xs">@{row.member.username}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center font-semibold text-white">{row.wins}</td>
                                            <td className="px-4 py-4 text-center text-gray-400">{row.losses}</td>
                                            {hasTies && (
                                                <td className="px-4 py-4 text-center text-gray-500">{row.ties}</td>
                                            )}
                                            <td className="px-4 py-4 text-right text-gray-300">{row.pointsFor.toFixed(2)}</td>
                                            {hasPA && (
                                                <td className="px-4 py-4 text-right text-gray-500 pr-6">{row.pointsAgainst.toFixed(2)}</td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* League info grid */}
                <div className="grid sm:grid-cols-2 gap-6">

                    {/* Roster Slots */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h2 className="font-semibold text-lg mb-4">Roster Slots</h2>
                        {rosterPositions.length > 0 ? (
                            <>
                                <p className="text-gray-300 text-sm leading-relaxed">
                                    {summariseRosterPositions(rosterPositions)}
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {rosterPositions.map((pos, i) => (
                                        <span
                                            key={i}
                                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                                pos === 'BN'
                                                    ? 'bg-gray-800 text-gray-500'
                                                    : pos === 'IR'
                                                        ? 'bg-red-900/30 text-red-500'
                                                        : 'bg-[#C8A951]/10 text-[#C8A951]'
                                            }`}
                                        >
                                            {pos}
                                        </span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-gray-600 text-sm">No roster data available.</p>
                        )}
                    </div>

                    {/* League Settings */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h2 className="font-semibold text-lg mb-4">League Settings</h2>
                        <dl className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Scoring</dt>
                                <dd className="text-gray-200 font-medium">{scoringLabel(currentScoringType)}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Teams</dt>
                                <dd className="text-gray-200 font-medium">{league.totalRosters}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Roster Size</dt>
                                <dd className="text-gray-200 font-medium">
                                    {rosterPositions.length > 0 ? rosterPositions.length : '—'}
                                </dd>
                            </div>
                            {leagueSettings?.playoff_teams != null && (
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Playoff Teams</dt>
                                    <dd className="text-gray-200 font-medium">{leagueSettings.playoff_teams}</dd>
                                </div>
                            )}
                            {leagueSettings?.trade_deadline != null && leagueSettings.trade_deadline > 0 && (
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Trade Deadline</dt>
                                    <dd className="text-gray-200 font-medium">Week {leagueSettings.trade_deadline}</dd>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Type</dt>
                                <dd className="text-gray-200 font-medium">
                                    {leagueSettings?.type === 2 ? 'Dynasty' : 'Redraft'}
                                </dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Platform</dt>
                                <dd className="text-gray-200 font-medium capitalize">Sleeper</dd>
                            </div>
                        </dl>
                    </div>
                </div>

            </div>
        </main>
    );
}
