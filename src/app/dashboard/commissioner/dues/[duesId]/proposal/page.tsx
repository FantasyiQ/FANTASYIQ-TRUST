'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface Member { id: string; displayName: string; teamName: string | null; }
interface ProposalItem { id: string; amount: number; status: string; payoutSpot: { label: string }; member: Member; }
interface Proposal { id: string; status: string; items: ProposalItem[]; }
interface DuesData { leagueName: string; members: Member[]; proposals: Proposal[]; }

export default function ProposalPage() {
    const router = useRouter();
    const params = useParams();
    const duesId = params.duesId as string;

    const [data, setData] = useState<DuesData | null>(null);
    const [assignments, setAssignments] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch(`/api/dues/${duesId}?include=proposals`)
            .then(r => r.json())
            .then((d: DuesData) => {
                setData(d);
                // Initialize assignments from existing proposal items
                const proposal = d.proposals?.[0];
                if (proposal) {
                    const init: Record<string, string> = {};
                    for (const item of proposal.items) {
                        init[item.id] = item.member.id;
                    }
                    setAssignments(init);
                }
                setLoading(false);
            });
    }, [duesId]);

    const proposal = data?.proposals?.[0];

    async function handleApprove() {
        setError('');
        // Validate all spots have unique member assignments
        const assigned = Object.values(assignments);
        if (assigned.some(v => !v)) { setError('Assign a winner to every payout spot.'); return; }
        const unique = new Set(assigned);
        if (unique.size !== assigned.length) { setError('Each member can only win one payout spot.'); return; }

        setSaving(true);
        const res = await fetch(`/api/dues/${duesId}/proposal/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proposalId: proposal!.id, assignments }),
        });
        const resData = await res.json();
        if (!res.ok) { setError(resData.error ?? 'Failed.'); setSaving(false); return; }
        router.push(`/dashboard/commissioner/dues/${duesId}?approved=1`);
    }

    async function handleReject() {
        if (!confirm('Reject this proposal? A league-wide poll will be opened for members to vote.')) return;
        setSaving(true);
        const res = await fetch(`/api/dues/${duesId}/proposal/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proposalId: proposal!.id }),
        });
        if (!res.ok) { setError('Failed to reject.'); setSaving(false); return; }
        router.push(`/dashboard/commissioner/dues/${duesId}/poll`);
    }

    if (loading) return <main className="min-h-screen bg-gray-950 text-white pt-24 px-6"><p className="text-gray-500">Loading...</p></main>;
    if (!proposal) return <main className="min-h-screen bg-gray-950 text-white pt-24 px-6"><p className="text-gray-500">No proposal found.</p></main>;

    const isPoll = proposal.status === 'polling';
    const isApproved = proposal.status === 'approved' || proposal.status === 'poll_passed';

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto space-y-6">
                <div>
                    <Link href={`/dashboard/commissioner/dues/${duesId}`} className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Tracker
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Payout Proposal</h1>
                    <p className="text-gray-400 text-sm mt-1">{data?.leagueName} · Assign winners to each payout spot then approve.</p>
                </div>

                {error && <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

                {isPoll && (
                    <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-xl px-4 py-3 text-yellow-400 text-sm">
                        This proposal is currently in a league poll. Members are voting.{' '}
                        <Link href={`/dashboard/commissioner/dues/${duesId}/poll`} className="underline">View Poll →</Link>
                    </div>
                )}

                {isApproved && (
                    <div className="bg-green-900/20 border border-green-800/50 rounded-xl px-4 py-3 text-green-400 text-sm">
                        This proposal has been approved. Payment links will be sent to winners.
                    </div>
                )}

                <div className="bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800">
                    {proposal.items.map((item) => (
                        <div key={item.id} className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-semibold text-white">{item.payoutSpot.label}</p>
                                <p className="text-[#C8A951] text-sm font-bold">${item.amount.toFixed(2)}</p>
                            </div>
                            {isApproved || isPoll ? (
                                <span className="text-gray-300 text-sm">{item.member.displayName}</span>
                            ) : (
                                <select
                                    value={assignments[item.id] ?? ''}
                                    onChange={e => setAssignments(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-[#C8A951]/60 min-w-[180px]">
                                    <option value="">— Select Winner —</option>
                                    {data?.members.map(m => (
                                        <option key={m.id} value={m.id}>{m.displayName}{m.teamName ? ` (${m.teamName})` : ''}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    ))}
                </div>

                {!isApproved && !isPoll && (
                    <div className="flex gap-3">
                        <button
                            onClick={handleApprove}
                            disabled={saving}
                            className="flex-1 bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold py-3 rounded-xl transition text-sm">
                            {saving ? 'Processing...' : 'Approve & Send Payment Links'}
                        </button>
                        <button
                            onClick={handleReject}
                            disabled={saving}
                            className="px-6 border border-red-800/50 text-red-400 hover:border-red-600 font-semibold py-3 rounded-xl transition text-sm">
                            Reject → Open Poll
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
