import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SeasonCalendarPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            leagues: {
                orderBy: { leagueName: 'asc' },
                select: {
                    id:           true,
                    leagueName:   true,
                    season:       true,
                    totalRosters: true,
                    scoringType:  true,
                    avatar:       true,
                    _count:       { select: { calendarEvents: true } },
                },
            },
        },
    });
    if (!user) redirect('/sign-in');

    const leagues = user.leagues;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-6">

                {/* Header */}
                <div>
                    <Link href="/dashboard/commissioner"
                        className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Season Calendar</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Trade deadlines, draft dates, playoff schedules — all in one place.
                    </p>
                </div>

                {leagues.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
                        <p className="text-4xl">📅</p>
                        <h2 className="text-lg font-bold">No leagues synced yet</h2>
                        <p className="text-gray-400 text-sm">Sync a league first to set up its season calendar.</p>
                        <Link href="/dashboard/sync"
                            className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-6 py-2.5 rounded-lg transition text-sm">
                            Sync a League
                        </Link>
                    </div>
                ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800">
                            <h2 className="font-bold">Your Leagues</h2>
                            <p className="text-gray-500 text-xs mt-0.5">Select a league to manage its calendar.</p>
                        </div>
                        <ul className="divide-y divide-gray-800/50">
                            {leagues.map(league => {
                                const count = league._count.calendarEvents;
                                return (
                                    <li key={league.id}>
                                        <Link
                                            href={`/dashboard/commissioner/calendar/${league.id}`}
                                            className="flex items-center gap-4 px-6 py-4 hover:bg-gray-800/30 transition group">
                                            {league.avatar ? (
                                                <Image
                                                    src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                                    alt={league.leagueName}
                                                    width={40} height={40}
                                                    className="rounded-lg shrink-0"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">
                                                    FF
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-white group-hover:text-[#C8A951] transition truncate">
                                                    {league.leagueName}
                                                </p>
                                                <p className="text-gray-500 text-xs mt-0.5">
                                                    {league.season} · {league.totalRosters} teams
                                                    {league.scoringType ? ` · ${league.scoringType.replace('_', '.').replace('ppr', 'PPR').replace('std', 'Std')}` : ''}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                {count > 0 ? (
                                                    <span className="text-xs font-semibold text-[#C8A951]">
                                                        {count} event{count !== 1 ? 's' : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-600">No events yet</span>
                                                )}
                                                <p className="text-gray-700 text-xs mt-0.5 group-hover:text-gray-500 transition">
                                                    Manage →
                                                </p>
                                            </div>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

            </div>
        </main>
    );
}
