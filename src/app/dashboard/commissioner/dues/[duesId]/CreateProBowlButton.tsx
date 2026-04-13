'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateProBowlButton({ duesId, leagueName }: { duesId: string; leagueName: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleCreate() {
        setError('');
        setLoading(true);
        const res = await fetch('/api/pro-bowl/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leagueName, leagueDuesId: duesId, season: new Date().getFullYear().toString() }),
        });
        const data = await res.json();
        setLoading(false);
        if (!res.ok) { setError(data.error ?? 'Failed to create contest.'); return; }
        router.push(`/dashboard/commissioner/pro-bowl/${data.id}`);
    }

    return (
        <div>
            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
            <button
                onClick={handleCreate}
                disabled={loading}
                className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm transition">
                {loading ? 'Creating…' : 'Create Contest'}
            </button>
        </div>
    );
}
