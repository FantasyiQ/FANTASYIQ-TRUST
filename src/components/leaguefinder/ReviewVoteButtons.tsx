'use client';

import { useState } from 'react';

interface Props {
    reviewId:        string;
    helpfulCount:    number;
    notHelpfulCount: number;
    myVote:          boolean | undefined; // true=helpful, false=not helpful, undefined=none
}

export default function ReviewVoteButtons({
    reviewId,
    helpfulCount:    initialHelpful,
    notHelpfulCount: initialNotHelpful,
    myVote:          initialVote,
}: Props) {
    const [helpful,    setHelpful]    = useState(initialHelpful);
    const [notHelpful, setNotHelpful] = useState(initialNotHelpful);
    const [myVote,     setMyVote]     = useState(initialVote);
    const [loading,    setLoading]    = useState(false);

    async function vote(isHelpful: boolean) {
        if (loading) return;
        setLoading(true);

        // Optimistic update
        const prev = myVote;
        if (prev === isHelpful) {
            // Toggle off
            if (isHelpful) setHelpful(n => n - 1); else setNotHelpful(n => n - 1);
            setMyVote(undefined);
        } else {
            if (prev !== undefined) {
                if (prev) setHelpful(n => n - 1); else setNotHelpful(n => n - 1);
            }
            if (isHelpful) setHelpful(n => n + 1); else setNotHelpful(n => n + 1);
            setMyVote(isHelpful);
        }

        try {
            const res = await fetch(`/api/lf/reviews/${reviewId}/vote`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ helpful: isHelpful }),
            });
            if (res.ok) {
                const data = await res.json() as { helpfulCount: number; notHelpfulCount: number };
                setHelpful(data.helpfulCount);
                setNotHelpful(data.notHelpfulCount);
            } else {
                // Revert
                setHelpful(initialHelpful);
                setNotHelpful(initialNotHelpful);
                setMyVote(initialVote);
            }
        } catch {
            setHelpful(initialHelpful);
            setNotHelpful(initialNotHelpful);
            setMyVote(initialVote);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-800/60">
            <span className="text-[9px] text-gray-700 uppercase tracking-wider">Helpful?</span>
            <button
                onClick={() => vote(true)}
                disabled={loading}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition disabled:opacity-50 ${
                    myVote === true
                        ? 'text-emerald-400 font-bold'
                        : 'text-gray-600 hover:text-gray-400'
                }`}
            >
                👍 {helpful > 0 && <span>{helpful}</span>}
            </button>
            <button
                onClick={() => vote(false)}
                disabled={loading}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition disabled:opacity-50 ${
                    myVote === false
                        ? 'text-red-400 font-bold'
                        : 'text-gray-600 hover:text-gray-400'
                }`}
            >
                👎 {notHelpful > 0 && <span>{notHelpful}</span>}
            </button>
        </div>
    );
}
