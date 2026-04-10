import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import VoteButtons from './VoteButtons';

export default async function PollPage({ params }: { params: Promise<{ duesId: string }> }) {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) redirect('/sign-in');

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        include: {
            members: { select: { id: true, displayName: true, userId: true } },
            proposals: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                    items: { include: { payoutSpot: true, member: true } },
                    poll: { include: { votes: true } },
                },
            },
        },
    });

    if (!dues) notFound();

    const isCommissioner = dues.commissionerId === user.id;
    // Members can vote if their userId matches
    const myMember = dues.members.find(m => m.userId === user.id);
    const canAccess = isCommissioner || !!myMember;
    if (!canAccess) redirect('/dashboard');

    const proposal = dues.proposals[0];
    const poll = proposal?.poll;

    if (!poll) redirect(`/dashboard/commissioner/dues/${duesId}`);

    const totalMembers = dues.members.length;
    const yesVotes = poll.votes.filter(v => v.vote).length;
    const noVotes = poll.votes.filter(v => !v.vote).length;
    const totalVotes = poll.votes.length;
    const yesPct = totalMembers > 0 ? Math.round((yesVotes / totalMembers) * 100) : 0;
    const hasVoted = myMember ? poll.votes.some(v => v.memberId === myMember.id) : false;
    const myVote = myMember ? poll.votes.find(v => v.memberId === myMember.id)?.vote : undefined;
    const isExpired = new Date() > new Date(poll.expiresAt);
    const threshold75 = Math.ceil(totalMembers * 0.75);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto space-y-6">
                <div>
                    {isCommissioner && (
                        <Link href={`/dashboard/commissioner/dues/${duesId}`} className="text-gray-500 hover:text-gray-300 text-sm transition">
                            ← Back to Tracker
                        </Link>
                    )}
                    <h1 className="text-2xl font-bold mt-3">League Poll</h1>
                    <p className="text-gray-400 text-sm mt-1">{dues.leagueName} · {poll.question}</p>
                </div>

                {/* Status banner */}
                {poll.status === 'passed' && (
                    <div className="bg-green-900/20 border border-green-800/50 rounded-xl px-4 py-3 text-green-400 text-sm font-semibold">
                        ✓ Poll passed ({yesPct}% yes). Proposal approved. Payment links being sent.
                    </div>
                )}
                {poll.status === 'failed' && (
                    <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm font-semibold">
                        Poll failed — less than 75% voted yes. Commissioner must reassign payouts.
                    </div>
                )}

                {/* Vote tally */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold">Current Vote</h2>
                        <span className="text-gray-500 text-sm">{totalVotes}/{totalMembers} voted · Needs {threshold75} yes votes (75%)</span>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-green-400 font-semibold">Yes — Approve</span>
                            <span className="text-green-400 font-bold">{yesVotes} ({yesPct}%)</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-3">
                            <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${yesPct}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-sm mt-2">
                            <span className="text-red-400 font-semibold">No — Reject</span>
                            <span className="text-red-400 font-bold">{noVotes}</span>
                        </div>
                    </div>

                    <div className="text-xs text-gray-600 pt-1">
                        Expires: {new Date(poll.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {isExpired && <span className="ml-2 text-yellow-500">· Expired</span>}
                    </div>
                </div>

                {/* Proposed payouts */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h2 className="font-bold mb-4">Proposed Payouts</h2>
                    <div className="space-y-3">
                        {proposal.items.map(item => (
                            <div key={item.id} className="flex items-center justify-between text-sm">
                                <div>
                                    <span className="text-white font-medium">{item.payoutSpot.label}</span>
                                    <span className="text-gray-500 ml-2">→ {item.member.displayName}</span>
                                </div>
                                <span className="text-[#C8A951] font-bold">${item.amount.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Vote buttons — only for league members, only if poll is open */}
                {myMember && poll.status === 'open' && !isExpired && (
                    <VoteButtons
                        pollId={poll.id}
                        memberId={myMember.id}
                        hasVoted={hasVoted}
                        myVote={myVote}
                    />
                )}

                {hasVoted && (
                    <p className="text-center text-gray-500 text-sm">
                        You voted: <span className={myVote ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{myVote ? 'Yes' : 'No'}</span>
                    </p>
                )}

                {/* Commissioner: close poll early if threshold reached */}
                {isCommissioner && poll.status === 'open' && yesPct >= 75 && (
                    <form action={`/api/dues/${duesId}/poll/close`} method="POST">
                        <input type="hidden" name="pollId" value={poll.id} />
                        <button type="submit" className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition text-sm">
                            Close Poll — 75% Threshold Reached
                        </button>
                    </form>
                )}
            </div>
        </main>
    );
}
