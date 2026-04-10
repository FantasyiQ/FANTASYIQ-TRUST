'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
    contestId: string;
    status: string;
    entryUrl: string;
}

export default function ContestControls({ contestId, status, entryUrl }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    async function transition(nextStatus: string) {
        setError('');
        setLoading(true);
        const res = await fetch(`/api/pro-bowl/${contestId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to update status.'); setLoading(false); return; }
        router.refresh();
        setLoading(false);
    }

    function copyLink() {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        navigator.clipboard.writeText(`${origin}${entryUrl}`).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-bold">Contest Controls</h2>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex flex-wrap gap-3">
                {status === 'setup' && (
                    <button
                        onClick={() => transition('open')}
                        disabled={loading}
                        className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm transition">
                        Open for Entries
                    </button>
                )}

                {status === 'open' && (
                    <>
                        <button
                            onClick={copyLink}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-5 py-2 rounded-xl text-sm transition">
                            {copied ? 'Copied!' : 'Copy Entry Link'}
                        </button>
                        <button
                            onClick={() => transition('locked')}
                            disabled={loading}
                            className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm transition">
                            Lock Entries
                        </button>
                    </>
                )}

                {status === 'locked' && (
                    <button
                        onClick={() => transition('scoring')}
                        disabled={loading}
                        className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm transition">
                        Begin Scoring
                    </button>
                )}

                {status === 'scoring' && (
                    <button
                        onClick={() => transition('complete')}
                        disabled={loading}
                        className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-5 py-2 rounded-xl text-sm transition">
                        Mark Complete
                    </button>
                )}

                {status === 'complete' && (
                    <span className="text-gray-500 text-sm py-2">Contest is complete.</span>
                )}
            </div>

            <div className="text-xs text-gray-600">
                {status === 'setup' && 'Open the contest to allow league members to submit lineups.'}
                {status === 'open' && 'Entries are open. Lock when Week 18 games begin.'}
                {status === 'locked' && 'Entries are locked. Begin scoring after Week 18 is complete.'}
                {status === 'scoring' && 'Scoring in progress. Mark complete when all scores are final.'}
            </div>
        </div>
    );
}
