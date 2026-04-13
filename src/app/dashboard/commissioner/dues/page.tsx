import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function potProgress(paid: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((paid / total) * 100));
}

function statusLabel(status: string): { label: string; className: string } {
    switch (status) {
        case 'setup':              return { label: 'Setup',             className: 'bg-gray-800 text-gray-400 border-gray-700' };
        case 'active':             return { label: 'Active',            className: 'bg-green-900/40 text-green-400 border-green-800' };
        case 'season_ended':       return { label: 'Season Ended',      className: 'bg-blue-900/40 text-blue-400 border-blue-800' };
        case 'pending_approval':   return { label: 'Awaiting Approval', className: 'bg-yellow-900/40 text-yellow-400 border-yellow-800' };
        case 'approved':           return { label: 'Approved',          className: 'bg-[#C8A951]/20 text-[#C8A951] border-[#C8A951]/40' };
        case 'paid_out':           return { label: 'Paid Out',          className: 'bg-gray-800 text-gray-500 border-gray-700' };
        default:                   return { label: status,              className: 'bg-gray-800 text-gray-400 border-gray-700' };
    }
}

export default async function DuesPage() {
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
                    leagueSize: true,
                    tier: true,
                    leagueDues: {
                        select: {
                            id: true,
                            leagueName: true,
                            season: true,
                            buyInAmount: true,
                            teamCount: true,
                            potTotal: true,
                            status: true,
                            members: { select: { duesStatus: true } },
                        },
                    },
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    const subs = user.subscriptions;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-6">

                <div>
                    <Link href="/dashboard/commissioner" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">League Dues & Payout Tracker</h1>
                    <p className="text-gray-400 text-sm mt-1">One tracker per commissioner league. Track buy-ins, manage payouts, and run polls.</p>
                </div>

                {subs.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                        <div className="text-4xl mb-4">🏆</div>
                        <h2 className="text-lg font-bold mb-2">No Commissioner Plans</h2>
                        <p className="text-gray-400 text-sm mb-6">You need an active commissioner plan to use the dues tracker.</p>
                        <Link href="/pricing?tab=commissioner"
                            className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-6 py-2.5 rounded-lg transition text-sm">
                            View Commissioner Plans
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {subs.map((sub) => {
                            const dues = sub.leagueDues;
                            const fullPot = dues ? dues.buyInAmount * dues.teamCount : 0;
                            const paidCount = dues?.members.filter(m => m.duesStatus === 'paid').length ?? 0;
                            const totalMembers = dues?.members.length ?? 0;
                            const progress = dues ? potProgress(dues.potTotal, fullPot) : 0;
                            const st = dues ? statusLabel(dues.status) : null;

                            return (
                                <div key={sub.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div>
                                            <p className="font-bold text-white text-lg">{sub.leagueName ?? 'Unnamed League'}</p>
                                            <p className="text-gray-500 text-sm mt-0.5">{sub.leagueSize}-Team League</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {st && (
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.className}`}>
                                                    {st.label}
                                                </span>
                                            )}
                                            <Link
                                                href={dues
                                                    ? `/dashboard/commissioner/dues/${dues.id}`
                                                    : `/dashboard/commissioner/dues/setup?subId=${sub.id}&leagueName=${encodeURIComponent(sub.leagueName ?? '')}&leagueSize=${sub.leagueSize ?? ''}`}
                                                className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-4 py-2 rounded-lg text-sm transition">
                                                {dues ? 'Open Tracker' : 'Set Up Tracker'}
                                            </Link>
                                        </div>
                                    </div>

                                    {dues ? (
                                        <div className="mt-5 space-y-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-400">{dues.season} Season · ${dues.buyInAmount}/team · {dues.teamCount} teams</span>
                                                <span className="text-gray-300 font-semibold">${dues.potTotal.toFixed(2)} / ${fullPot.toFixed(2)}</span>
                                            </div>
                                            <div className="w-full bg-gray-800 rounded-full h-2">
                                                <div
                                                    className="bg-[#C8A951] h-2 rounded-full transition-all"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <div className="flex gap-4 text-xs text-gray-500">
                                                <span>{paidCount}/{totalMembers} members paid</span>
                                                <span>{progress}% of pot collected</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="mt-4 text-gray-500 text-sm">No tracker set up yet. Click Set Up Tracker to get started.</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
