import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import CreateProBowlForm from './CreateProBowlForm';

function statusLabel(status: string) {
    switch (status) {
        case 'setup':    return { label: 'Setup',     className: 'bg-gray-800 text-gray-400 border-gray-700' };
        case 'open':     return { label: 'Open',      className: 'bg-green-900/40 text-green-400 border-green-800' };
        case 'locked':   return { label: 'Locked',    className: 'bg-yellow-900/40 text-yellow-400 border-yellow-800' };
        case 'scoring':  return { label: 'Scoring',   className: 'bg-blue-900/40 text-blue-400 border-blue-800' };
        case 'complete': return { label: 'Complete',  className: 'bg-gray-800 text-gray-500 border-gray-700' };
        default:         return { label: status,      className: 'bg-gray-800 text-gray-400 border-gray-700' };
    }
}

export default async function ProBowlPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            subscriptions: {
                where: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                select: {
                    id: true,
                    leagueName: true,
                    leagueDues: {
                        select: {
                            id: true,
                            leagueName: true,
                            proBowl: {
                                select: {
                                    id: true,
                                    season: true,
                                    week: true,
                                    status: true,
                                    _count: { select: { entries: true } },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    const leaguesWithDues = user.subscriptions
        .filter(s => s.leagueDues)
        .map(s => s.leagueDues!);

    const leaguesWithoutContest = leaguesWithDues.filter(d => !d.proBowl);
    const contests = leaguesWithDues.filter(d => d.proBowl).map(d => ({ dues: d, contest: d.proBowl! }));

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <Link href="/dashboard/commissioner" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Pro Bowl Contest</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Week 18 free contest — DraftKings-style lineup picks, no salary cap. One contest per league.
                    </p>
                </div>

                {/* Existing contests */}
                {contests.length > 0 && (
                    <div className="space-y-4">
                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Your Contests</h2>
                        {contests.map(({ dues, contest }) => {
                            const st = statusLabel(contest.status);
                            return (
                                <div key={contest.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
                                    <div>
                                        <p className="font-bold text-white">{dues.leagueName}</p>
                                        <p className="text-gray-500 text-sm mt-0.5">{contest.season} Season · Week {contest.week} · {contest._count.entries} entries</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.className}`}>
                                            {st.label}
                                        </span>
                                        <Link href={`/dashboard/commissioner/pro-bowl/${contest.id}`}
                                            className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-4 py-2 rounded-lg text-sm transition">
                                            Manage →
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Create new contest */}
                {leaguesWithoutContest.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
                        <div>
                            <h2 className="font-bold text-lg">Create a Pro Bowl Contest</h2>
                            <p className="text-gray-400 text-sm mt-1">Select which league to run the contest for. Members pick any NFL lineup — no salary cap.</p>
                        </div>
                        <CreateProBowlForm leagues={leaguesWithoutContest.map(d => ({ id: d.id, leagueName: d.leagueName }))} />
                    </div>
                )}

                {leaguesWithDues.length === 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                        <div className="text-4xl mb-4">🏈</div>
                        <h2 className="text-lg font-bold mb-2">Set Up a League Tracker First</h2>
                        <p className="text-gray-400 text-sm mb-6">Pro Bowl contests are tied to your league dues tracker. Set one up first.</p>
                        <Link href="/dashboard/commissioner/dues"
                            className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-6 py-2.5 rounded-lg transition text-sm">
                            Go to Dues Tracker
                        </Link>
                    </div>
                )}
            </div>
        </main>
    );
}
