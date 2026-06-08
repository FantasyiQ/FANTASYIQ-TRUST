'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface Member { id: string; displayName: string; teamName: string | null; }
interface ProposalItem {
    id: string;
    amount: number;
    status: string;
    winnerClaimToken: string | null;
    failedReason: string | null;
    payoutSpot: { label: string };
    member: Member;
}
interface Proposal { id: string; status: string; items: ProposalItem[]; }
interface DuesData { leagueName: string; members: Member[]; proposals: Proposal[]; }

const STATUS_LABEL: Record<string, string> = {
    pending:            'Pending',
    approved:           'Approved',
    claim_sent:         'Claim link sent',
    transfer_initiated: 'Transfer sent',
    paid_out:           'Paid out',
    failed:             'Transfer failed',
};

export default function ProposalPage() {
    const router = useRouter();
    const params = useParams();
    const duesId = params.duesId as string;

    const [data, setData] = useState<DuesData | null>(null);
    const [assignments, setAssignments] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [retrying, setRetrying] = useState<Record<string, boolean>>({});
    const [retryMessages, setRetryMessages] = useState<Record<string, string>>({});

    const loadData = useCallback(() => {
        fetch(`/api/dues/${duesId}?include=proposals`)
            .then(r => r.json())
            .then((d: DuesData) => {
                setData(d);
                const proposal = d.proposals?.[0];
                if (proposal) {
                    const init: Record<string, string> = {};
                    for (const item of proposal.items) {
                        if (item.member?.id) init[item.id] = item.member.id;
                    }
                    setAssignments(init);
                }
                setLoading(false);
            });
    }, [duesId]);

    useEffect(() => { loadData(); }, [loadData]);

    const proposal = data?.proposals?.[0];

    async function handleApprove() {
        setError('');
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

    async function handleRetry(item: ProposalItem) {
        if (!item.winnerClaimToken) return;
        setRetrying(prev => ({ ...prev, [item.id]: true }));
        setRetryMessages(prev => ({ ...prev, [item.id]: '' }));

        const res = await fetch('/api/stripe/connect/winner-retry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claimToken: item.winnerClaimToken }),
        });
        const resData = await res.json() as { action?: string; url?: string; transferId?: string; error?: string };

        if (!res.ok) {
            setRetryMessages(prev => ({ ...prev, [item.id]: resData.error ?? 'Retry failed.' }));
            setRetrying(prev => ({ ...prev, [item.id]: false }));
            return;
        }

        if (resData.action === 'onboard' && resData.url) {
            window.open(resData.url, '_blank');
            setRetryMessages(prev => ({ ...prev, [item.id]: 'New onboarding link opened — share it with the winner.' }));
        } else if (resData.action === 'transferred') {
            setRetryMessages(prev => ({ ...prev, [item.id]: `Transfer sent (${resData.transferId}).` }));
        }

        setRetrying(prev => ({ ...prev, [item.id]: false }));
        loadData();
    }

    if (loading) return <main className="min-h-screen bg-gray-950 text-white pt-24 px-6"><p className="text-gray-500">Loading...</p></main>;
    if (!proposal) return <main className="min-h-screen bg-gray-950 text-white pt-24 px-6"><p className="text-gray-500">No proposal found.</p></main>;

    const isPoll      = proposal.status === 'polling';
    const isApproved  = proposal.status === 'approved' || proposal.status === 'poll_passed';
    const failedItems = proposal.items.filter(i => i.status === 'failed');

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

                {isApproved && failedItems.length === 0 && (
                    <div className="bg-green-900/20 border border-green-800/50 rounded-xl px-4 py-3 text-green-400 text-sm">
                        This proposal has been approved. Payment links will be sent to winners.
                    </div>
                )}

                <div className="bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800">
                    {proposal.items.map((item) => (
                        <div key={item.id} className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-semibold text-white">{item.payoutSpot.label}</p>
                                <p className="text-[#D4AF37] text-sm font-bold">${item.amount.toFixed(2)}</p>
                                {isApproved && (
                                    <p className={`text-xs mt-0.5 ${item.status === 'failed' ? 'text-red-400' : 'text-gray-500'}`}>
                                        {STATUS_LABEL[item.status] ?? item.status}
                                    </p>
                                )}
                            </div>
                            {isApproved || isPoll ? (
                                <span className="text-gray-300 text-sm">{item.member.displayName}</span>
                            ) : (
                                <select
                                    value={assignments[item.id] ?? ''}
                                    onChange={e => setAssignments(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-[#D4AF37]/60 min-w-[180px]">
                                    <option value="">— Select Winner —</option>
                                    {data?.members.map(m => (
                                        <option key={m.id} value={m.id}>{m.displayName}{m.teamName ? ` (${m.teamName})` : ''}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    ))}
                </div>

                {/* Failed transfers — commissioner retry panel */}
                {failedItems.length > 0 && (
                    <div className="bg-red-950/30 border border-red-800/40 rounded-2xl divide-y divide-red-900/30">
                        <div className="px-6 py-4">
                            <p className="font-semibold text-red-400 text-sm">Failed Transfers</p>
                            <p className="text-red-400/70 text-xs mt-0.5">
                                These payouts did not complete. Retry to re-send the winner&apos;s onboarding link or re-attempt the transfer.
                            </p>
                        </div>
                        {failedItems.map(item => (
                            <div key={item.id} className="px-6 py-4 space-y-3">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div>
                                        <p className="text-white text-sm font-semibold">{item.member.displayName}</p>
                                        <p className="text-gray-400 text-xs">{item.payoutSpot.label} · ${item.amount.toFixed(2)}</p>
                                        {item.failedReason && (
                                            <p className="text-red-400/70 text-xs mt-1 font-mono break-all">{item.failedReason}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleRetry(item)}
                                        disabled={retrying[item.id]}
                                        className="shrink-0 bg-red-800/40 hover:bg-red-800/60 disabled:opacity-50 border border-red-700/50 text-red-300 font-semibold text-xs px-4 py-2 rounded-xl transition">
                                        {retrying[item.id] ? 'Retrying…' : 'Retry Payout'}
                                    </button>
                                </div>
                                {retryMessages[item.id] && (
                                    <p className="text-xs text-gray-400">{retryMessages[item.id]}</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {!isApproved && !isPoll && (
                    <div className="flex gap-3">
                        <button
                            onClick={handleApprove}
                            disabled={saving}
                            className="flex-1 bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-50 text-black font-bold py-3 rounded-xl transition text-sm">
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
