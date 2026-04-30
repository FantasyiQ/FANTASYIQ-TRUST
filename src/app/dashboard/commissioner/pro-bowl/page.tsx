import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function deriveStatus(c: { openAt: Date; lockAt: Date; endAt: Date; isActive: boolean }): string {
    if (!c.isActive) return 'canceled';
    const now = new Date();
    if (now < c.openAt)  return 'upcoming';
    if (now < c.lockAt)  return 'open';
    if (now < c.endAt)   return 'locked';
    return 'complete';
}

const STATUS_STYLES: Record<string, string> = {
    upcoming: 'bg-gray-800 text-gray-400 border-gray-700',
    open:     'bg-green-900/40 text-green-400 border-green-800',
    locked:   'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    complete: 'bg-gray-800 text-gray-500 border-gray-700',
    canceled: 'bg-red-900/20 text-red-400 border-red-900',
};

export default async function ProBowlPage() {
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
                    avatar:       true,
                    proBowlContests: {
                        orderBy: { createdAt: 'desc' },
                        select: {
                            id: true, name: true,
                            openAt: true, lockAt: true, endAt: true, isActive: true,
                            _count: { select: { entries: true } },
                        },
                    },
                },
            },
        },
    });
    if (!user) redirect('/sign-in');

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-6">

                <div>
                    <Link href="/dashboard/commissioner"
                        className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Pro Bowl Contest</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        DraftKings-style salary cap lineup contest for your leagues.
                    </p>
                </div>

                {user.leagues.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
                        <p className="text-4xl">🏈</p>
                        <h2 className="text-lg font-bold">No leagues synced yet</h2>
                        <p className="text-gray-400 text-sm">Sync a league to create a Pro Bowl contest for it.</p>
                        <Link href="/dashboard/sync"
                            className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-6 py-2.5 rounded-lg transition text-sm">
                            Sync a League
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {user.leagues.map(league => (
                            <div key={league.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                {/* League header */}
                                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        {league.avatar ? (
                                            <Image
                                                src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                                alt={league.leagueName} width={36} height={36}
                                                className="rounded-lg shrink-0"
                                            />
                                        ) : (
                                            <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">FF</div>
                                        )}
                                        <div>
                                            <p className="font-bold text-white">{league.leagueName}</p>
                                            <p className="text-gray-500 text-xs">{league.season} · {league.totalRosters} teams</p>
                                        </div>
                                    </div>
                                    <Link
                                        href={`/dashboard/commissioner/pro-bowl/create?leagueId=${league.id}`}
                                        className="border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-3 py-1.5 rounded-lg text-sm transition">
                                        + New Contest
                                    </Link>
                                </div>

                                {/* Contests for this league */}
                                {league.proBowlContests.length === 0 ? (
                                    <div className="px-6 py-6 text-center text-gray-600 text-sm">
                                        No contests yet.
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-gray-800/50">
                                        {league.proBowlContests.map(contest => {
                                            const status = deriveStatus(contest);
                                            return (
                                                <li key={contest.id}>
                                                    <Link
                                                        href={`/dashboard/commissioner/pro-bowl/${contest.id}`}
                                                        className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-800/30 transition group">
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-white group-hover:text-[#C8A951] transition truncate">
                                                                {contest.name}
                                                            </p>
                                                            <p className="text-gray-600 text-xs mt-0.5">
                                                                {contest._count.entries} entries · Locks {new Date(contest.lockAt).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[status] ?? STATUS_STYLES.upcoming}`}>
                                                                {status.charAt(0).toUpperCase() + status.slice(1)}
                                                            </span>
                                                            <span className="text-gray-600 group-hover:text-[#C8A951] transition text-sm">→</span>
                                                        </div>
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
