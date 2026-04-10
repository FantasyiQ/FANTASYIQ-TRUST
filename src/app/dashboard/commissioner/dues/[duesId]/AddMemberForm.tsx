'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddMemberForm({ duesId }: { duesId: string }) {
    const router = useRouter();
    const [displayName, setDisplayName] = useState('');
    const [teamName, setTeamName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!displayName.trim()) { setError('Member name is required.'); return; }

        setLoading(true);
        try {
            const res = await fetch('/api/dues/members/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duesId, displayName: displayName.trim(), teamName: teamName.trim(), email: email.trim() }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'Failed to add member.'); return; }
            setDisplayName(''); setTeamName(''); setEmail('');
            router.refresh();
        } catch {
            setError('Something went wrong.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-sm font-medium text-gray-400">Add Member</p>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Member Name *"
                    maxLength={60}
                    className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                />
                <input
                    type="text"
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    placeholder="Team Name (optional)"
                    maxLength={60}
                    className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                />
                <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                />
            </div>
            <button
                type="submit"
                disabled={loading}
                className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition">
                {loading ? 'Adding...' : '+ Add Member'}
            </button>
        </form>
    );
}
