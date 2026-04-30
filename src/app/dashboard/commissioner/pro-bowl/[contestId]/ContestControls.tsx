'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
    contestId: string;
    status:    string;  // derived: upcoming | open | locked | complete | canceled
    isActive:  boolean;
    openAt:    string;  // ISO
    lockAt:    string;  // ISO
    endAt:     string;  // ISO
    entryUrl:  string;
}

function localDatetime(iso: string): string {
    const d = new Date(iso);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export default function ContestControls({ contestId, status, isActive, openAt, lockAt, endAt, entryUrl }: Props) {
    const router = useRouter();
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');
    const [copied,    setCopied]    = useState(false);
    const [showDates, setShowDates] = useState(false);

    // Date editing state
    const [editOpen, setEditOpen] = useState(localDatetime(openAt));
    const [editLock, setEditLock] = useState(localDatetime(lockAt));
    const [editEnd,  setEditEnd]  = useState(localDatetime(endAt));
    const [savingDates, setSavingDates] = useState(false);

    async function patch(body: Record<string, unknown>) {
        setError('');
        setLoading(true);
        const res = await fetch(`/api/pro-bowl/${contestId}/status`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to update.'); setLoading(false); return; }
        router.refresh();
        setLoading(false);
    }

    async function saveDates(e: React.FormEvent) {
        e.preventDefault();
        setSavingDates(true);
        setError('');
        const res = await fetch(`/api/pro-bowl/${contestId}/status`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ openAt: editOpen, lockAt: editLock, endAt: editEnd }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to save dates.'); setSavingDates(false); return; }
        setSavingDates(false);
        setShowDates(false);
        router.refresh();
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
                {status === 'upcoming' && (
                    <button
                        onClick={() => patch({ openAt: new Date().toISOString() })}
                        disabled={loading}
                        className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm transition">
                        Open Entries Now
                    </button>
                )}

                {status === 'open' && (
                    <>
                        <button
                            onClick={copyLink}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-5 py-2 rounded-xl text-sm transition border border-gray-700">
                            {copied ? 'Copied!' : 'Copy Entry Link'}
                        </button>
                        <button
                            onClick={() => patch({ lockAt: new Date().toISOString() })}
                            disabled={loading}
                            className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm transition">
                            Lock Entries Now
                        </button>
                    </>
                )}

                {status === 'locked' && (
                    <button
                        onClick={() => patch({ markFinal: true })}
                        disabled={loading}
                        className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-5 py-2 rounded-xl text-sm transition">
                        Mark Scoring Final
                    </button>
                )}

                {status === 'complete' && (
                    <span className="text-gray-500 text-sm py-2">Contest is complete.</span>
                )}

                {status !== 'canceled' && status !== 'complete' && (
                    <button
                        onClick={() => patch({ isActive: false })}
                        disabled={loading}
                        className="bg-red-900/30 hover:bg-red-900/50 disabled:opacity-50 text-red-400 font-semibold px-5 py-2 rounded-xl text-sm transition border border-red-900/50">
                        Cancel Contest
                    </button>
                )}

                {status === 'canceled' && (
                    <button
                        onClick={() => patch({ isActive: true })}
                        disabled={loading}
                        className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold px-5 py-2 rounded-xl text-sm transition border border-gray-700">
                        Reactivate
                    </button>
                )}

                <button
                    onClick={() => setShowDates(v => !v)}
                    className="text-gray-500 hover:text-gray-300 text-sm py-2 transition">
                    {showDates ? 'Hide dates ↑' : 'Edit dates ↓'}
                </button>
            </div>

            <div className="text-xs text-gray-600">
                {status === 'upcoming' && `Opens ${new Date(openAt).toLocaleString()} · Locks ${new Date(lockAt).toLocaleString()}`}
                {status === 'open'     && `Locks ${new Date(lockAt).toLocaleString()} · Entries open now.`}
                {status === 'locked'   && `Ends ${new Date(endAt).toLocaleString()} · Entries locked.`}
                {status === 'canceled' && 'Contest is canceled. Reactivate to allow entries again.'}
            </div>

            {showDates && (
                <form onSubmit={saveDates} className="border-t border-gray-800 pt-4 space-y-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Edit Schedule</p>
                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Opens At</label>
                            <input
                                type="datetime-local"
                                value={editOpen}
                                onChange={e => setEditOpen(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#C8A951]/60"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Locks At</label>
                            <input
                                type="datetime-local"
                                value={editLock}
                                onChange={e => setEditLock(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#C8A951]/60"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Ends At</label>
                            <input
                                type="datetime-local"
                                value={editEnd}
                                onChange={e => setEditEnd(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#C8A951]/60"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={savingDates}
                        className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition">
                        {savingDates ? 'Saving…' : 'Save Dates'}
                    </button>
                </form>
            )}
        </div>
    );
}
