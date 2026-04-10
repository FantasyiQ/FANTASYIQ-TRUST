'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface League { id: string; leagueName: string; }

export default function CreateProBowlForm({ leagues }: { leagues: League[] }) {
    const router = useRouter();
    const [leagueDuesId, setLeagueDuesId] = useState(leagues[0]?.id ?? '');
    const [season, setSeason] = useState(new Date().getFullYear().toString());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        const res = await fetch('/api/pro-bowl/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leagueDuesId, season }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to create contest.'); setLoading(false); return; }
        router.push(`/dashboard/commissioner/pro-bowl/${data.id}`);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="grid sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">League</label>
                    <select
                        value={leagueDuesId}
                        onChange={e => setLeagueDuesId(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#C8A951]/60">
                        {leagues.map(l => <option key={l.id} value={l.id}>{l.leagueName}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Season</label>
                    <input
                        type="text"
                        value={season}
                        onChange={e => setSeason(e.target.value)}
                        maxLength={4}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#C8A951]/60"
                    />
                </div>
            </div>
            <button
                type="submit"
                disabled={loading}
                className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-6 py-2.5 rounded-xl text-sm transition">
                {loading ? 'Creating...' : 'Create Contest'}
            </button>
        </form>
    );
}
