import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ContestControls from './ContestControls';

const POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

export default async function ManageProBowlPage({ params }: { params: Promise<{ contestId: string }> }) {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) redirect('/sign-in');

    const contest = await prisma.proBowlContest.findUnique({
        where: { id: contestId },
        include: {
            leagueDues: { select: { id: true } },
            entries: {
                include: { user: { select: { name: true, email: true } } },
                orderBy: [{ totalPoints: 'desc' }, { createdAt: 'asc' }],
            },
        },
    });

    if (!contest) notFound();
    if (contest.commissionerId !== user.id) redirect('/dashboard/commissioner/pro-bowl');

    const leagueName = contest.leagueName ?? contest.leagueDues?.id ?? 'League';
    const entryUrl   = `/dashboard/pro-bowl/${contestId}`;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <Link href="/dashboard/commissioner/pro-bowl" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Pro Bowl
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Pro Bowl — {leagueName}</h1>
                    <p className="text-gray-400 text-sm mt-1">{contest.season} Season · Week {contest.week} · {POSITIONS.length} roster spots · Free contest</p>
                </div>

                {/* Controls */}
                <ContestControls contestId={contestId} status={contest.status} entryUrl={entryUrl} />

                {/* Lineup requirements */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h2 className="font-bold mb-4">Lineup Format</h2>
                    <div className="flex flex-wrap gap-2">
                        {POSITIONS.map((pos, i) => (
                            <span key={i} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm font-semibold text-gray-300">
                                {pos}
                            </span>
                        ))}
                    </div>
                    <p className="text-gray-500 text-xs mt-3">No salary cap — pick any NFL player. FLEX can be RB/WR/TE.</p>
                </div>

                {/* Entries */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                        <h2 className="font-bold">Entries</h2>
                        <span className="text-gray-500 text-sm">{contest.entries.length} submitted</span>
                    </div>

                    {contest.entries.length === 0 ? (
                        <div className="px-6 py-10 text-center text-gray-500 text-sm">
                            No entries yet. Share the entry link with your league members.
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-800/50">
                            {contest.entries.map((entry, i) => (
                                <li key={entry.id} className="px-6 py-4 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-gray-600 text-sm w-5">{i + 1}.</span>
                                        <div>
                                            <p className="text-white text-sm font-medium">{entry.user.name ?? entry.user.email}</p>
                                            <p className="text-gray-600 text-xs">Submitted {new Date(entry.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {entry.totalPoints != null ? (
                                            <p className="text-[#C8A951] font-bold">{entry.totalPoints.toFixed(1)} pts</p>
                                        ) : (
                                            <p className="text-gray-600 text-xs">Awaiting scoring</p>
                                        )}
                                        {entry.rank && <p className="text-gray-500 text-xs">Rank #{entry.rank}</p>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Share link */}
                {contest.status === 'open' && (
                    <div className="bg-[#C8A951]/10 border border-[#C8A951]/30 rounded-2xl p-5">
                        <p className="text-sm font-semibold text-[#C8A951] mb-1">Share Entry Link</p>
                        <p className="text-gray-400 text-xs mb-3">Send this link to your league members. They must have a FantasyIQ account to enter.</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 truncate">
                                {typeof window !== 'undefined' ? window.location.origin : ''}{entryUrl}
                            </code>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
