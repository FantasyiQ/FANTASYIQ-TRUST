'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
    leagueId:   string;
    leagueName: string;
}

function localDatetimeDefault(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setSeconds(0, 0);
    // toISOString gives UTC; we want local so it pre-fills the datetime-local input correctly
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export default function CreateProBowlForm({ leagueId, leagueName }: Props) {
    const router = useRouter();
    const [name,    setName]    = useState(`${leagueName} Pro Bowl`);
    const [openAt,  setOpenAt]  = useState(localDatetimeDefault(0));
    const [lockAt,  setLockAt]  = useState(localDatetimeDefault(7));
    const [endAt,   setEndAt]   = useState(localDatetimeDefault(14));
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        const res = await fetch('/api/pro-bowl/create', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ leagueId, name, openAt, lockAt, endAt }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to create contest.'); setLoading(false); return; }
        router.push(`/dashboard/commissioner/pro-bowl/${data.id}`);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Contest Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#C8A951]/60"
                />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Opens At</label>
                    <input
                        type="datetime-local"
                        value={openAt}
                        onChange={e => setOpenAt(e.target.value)}
                        required
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#C8A951]/60"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Locks At</label>
                    <input
                        type="datetime-local"
                        value={lockAt}
                        onChange={e => setLockAt(e.target.value)}
                        required
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#C8A951]/60"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Ends At</label>
                    <input
                        type="datetime-local"
                        value={endAt}
                        onChange={e => setEndAt(e.target.value)}
                        required
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#C8A951]/60"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-6 py-2.5 rounded-xl text-sm transition">
                {loading ? 'Creating…' : 'Create Contest'}
            </button>
        </form>
    );
}
