'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
    pollId: string;
    memberId: string;
    hasVoted: boolean;
    myVote?: boolean;
}

export default function VoteButtons({ pollId, memberId, hasVoted }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function vote(v: boolean) {
        setLoading(true); setError('');
        const res = await fetch('/api/dues/poll/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pollId, memberId, vote: v }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to vote.'); setLoading(false); return; }
        router.refresh();
        setLoading(false);
    }

    if (hasVoted) return null;

    return (
        <div className="space-y-3">
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => vote(true)}
                    disabled={loading}
                    className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm">
                    ✓ Yes — Approve
                </button>
                <button
                    onClick={() => vote(false)}
                    disabled={loading}
                    className="bg-red-900/50 hover:bg-red-800/50 border border-red-800 disabled:opacity-50 text-red-400 font-bold py-3 rounded-xl transition text-sm">
                    ✕ No — Reject
                </button>
            </div>
            <p className="text-gray-600 text-xs text-center">Your vote is final once submitted.</p>
        </div>
    );
}
