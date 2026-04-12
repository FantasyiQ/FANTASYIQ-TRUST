import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import MemberRow from './MemberRow';
import CreateProBowlButton from './CreateProBowlButton';

function potProgress(paid: number, total: number) {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((paid / total) * 100));
}

export default async function DuesTrackerPage({ params }: { params: Promise<{ duesId: string }> }) {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) redirect('/sign-in');

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        include: {
            members: { orderBy: { createdAt: 'asc' } },
            payoutSpots: { orderBy: { sortOrder: 'asc' } },
            proposals: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: { items: { include: { member: true, payoutSpot: true } }, poll: true },
            },
            proBowl: { select: { id: true, season: true, week: true, status: true, _count: { select: { entries: true } } } },
        },
    });

    if (!dues) notFound();
    if (dues.commissionerId !== user.id) redirect('/dashboard/commissioner/dues');

    const fullPot = dues.buyInAmount * dues.teamCount;
    const progress = potProgress(dues.potTotal, fullPot);
    const paidCount = dues.members.filter(m => m.duesStatus === 'paid').length;
    const unpaidCount = dues.members.filter(m => m.duesStatus === 'unpaid').length;
    const potWhole = dues.potTotal >= fullPot && dues.members.length === dues.teamCount;
    const latestProposal = dues.proposals[0] ?? null;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <Link href="/dashboard/commissioner/dues" className="text-gray-500 hover:text-gray-300 text-sm transition">
                            ← Back to Dues Tracker
                        </Link>
                        <h1 className="text-2xl font-bold mt-3">{dues.leagueName}</h1>
                        <p className="text-gray-400 text-sm mt-0.5">{dues.season} Season · ${dues.buyInAmount}/team · {dues.teamCount} teams</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Link href={`/dashboard/commissioner/dues/${duesId}/future-dues`}
                            className="border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-4 py-2 rounded-lg text-sm transition">
                            Future Dues
                        </Link>
                        <Link href={`/dashboard/commissioner/dues/${duesId}/payouts`}
                            className="border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-4 py-2 rounded-lg text-sm transition">
                            Payout Spots
                        </Link>
                        {latestProposal && (
                            <Link href={`/dashboard/commissioner/dues/${duesId}/proposal`}
                                className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-4 py-2 rounded-lg text-sm transition">
                                Review Proposal
                            </Link>
                        )}
                    </div>
                </div>

                {/* Pot summary */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-lg">League Pot</h2>
                        <span className={`text-sm font-semibold ${potWhole ? 'text-green-400' : 'text-yellow-400'}`}>
                            {potWhole ? '✓ Pot Complete' : `$${(fullPot - dues.potTotal).toFixed(2)} remaining`}
                        </span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-extrabold text-white">${dues.potTotal.toFixed(2)}</span>
                        <span className="text-gray-500 text-lg mb-1">/ ${fullPot.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-3">
                        <div className="bg-[#C8A951] h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-1">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-green-400">{paidCount}</p>
                            <p className="text-gray-500 text-xs mt-0.5">Paid</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-red-400">{unpaidCount}</p>
                            <p className="text-gray-500 text-xs mt-0.5">Unpaid</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-300">{dues.members.length}/{dues.teamCount}</p>
                            <p className="text-gray-500 text-xs mt-0.5">Roster Added</p>
                        </div>
                    </div>
                </div>

                {/* Roster */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                        <h2 className="font-bold">League Roster</h2>
                        <span className="text-gray-500 text-sm">{dues.members.length} of {dues.teamCount} added</span>
                    </div>

                    {dues.members.length === 0 ? (
                        <div className="px-6 py-10 text-center text-gray-500 text-sm">
                            No members added yet. Add your league roster below.
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-800/50">
                            {dues.members.map((member) => (
                                <MemberRow
                                    key={member.id}
                                    member={member}
                                    duesId={duesId}
                                    buyInAmount={dues.buyInAmount}
                                    potWhole={potWhole}
                                    commissionerId={user.id}
                                />
                            ))}
                        </ul>
                    )}

                    {dues.members.length === 0 && (
                        <div className="px-6 py-5 border-t border-gray-800 text-center">
                            <p className="text-gray-500 text-sm">Roster will be imported automatically when Sleeper/ESPN integration is connected.</p>
                        </div>
                    )}
                </div>

                {/* Pro Bowl Contest */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="font-bold">Pro Bowl Contest</h2>
                        {dues.proBowl && (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                dues.proBowl.status === 'open'     ? 'bg-green-900/40 text-green-400 border-green-800' :
                                dues.proBowl.status === 'locked'   ? 'bg-yellow-900/40 text-yellow-400 border-yellow-800' :
                                dues.proBowl.status === 'scoring'  ? 'bg-blue-900/40 text-blue-400 border-blue-800' :
                                dues.proBowl.status === 'complete' ? 'bg-gray-800 text-gray-500 border-gray-700' :
                                'bg-gray-800 text-gray-400 border-gray-700'
                            }`}>
                                {dues.proBowl.status.charAt(0).toUpperCase() + dues.proBowl.status.slice(1)}
                            </span>
                        )}
                    </div>
                    <p className="text-gray-500 text-sm mb-4">Week 18 free contest — DraftKings-style lineup picks, no salary cap.</p>
                    {dues.proBowl ? (
                        <div className="flex items-center justify-between">
                            <p className="text-gray-400 text-sm">{dues.proBowl.season} Season · Week {dues.proBowl.week} · {dues.proBowl._count.entries} entries</p>
                            <Link href={`/dashboard/commissioner/pro-bowl/${dues.proBowl.id}`}
                                className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-4 py-2 rounded-lg text-sm transition">
                                Manage →
                            </Link>
                        </div>
                    ) : (
                        <CreateProBowlButton duesId={duesId} />
                    )}
                </div>

                {/* Payout spots summary */}
                {dues.payoutSpots.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold">Payout Spots</h2>
                            <Link href={`/dashboard/commissioner/dues/${duesId}/payouts`}
                                className="text-[#C8A951] text-sm hover:underline">Edit</Link>
                        </div>
                        <div className="space-y-2">
                            {dues.payoutSpots.map((spot) => (
                                <div key={spot.id} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-300">{spot.label}</span>
                                    <span className="text-white font-semibold">${spot.amount.toFixed(2)}</span>
                                </div>
                            ))}
                            <div className="border-t border-gray-800 pt-2 flex items-center justify-between text-sm font-bold">
                                <span className="text-gray-400">Total</span>
                                <span className={dues.payoutSpots.reduce((s, p) => s + p.amount, 0) === fullPot ? 'text-green-400' : 'text-red-400'}>
                                    ${dues.payoutSpots.reduce((s, p) => s + p.amount, 0).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}
