'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface SyncedLeague {
    id: string;
    leagueName: string;
    totalRosters: number;
    season: string;
    platform: string;
}

interface Props {
    syncedLeagues: SyncedLeague[];
}

export default function DuesSetupForm({ syncedLeagues }: Props) {
    const router = useRouter();
    const params = useSearchParams();
    const subId        = params.get('subId') ?? '';
    const paramName    = params.get('leagueName') ?? '';
    const paramSize    = params.get('leagueSize') ?? '';

    // Auto-match a synced league by name (case-insensitive)
    const autoMatch = paramName
        ? syncedLeagues.find(l => l.leagueName.toLowerCase() === paramName.toLowerCase())
        : null;

    const [selectedLeagueId, setSelectedLeagueId] = useState(autoMatch?.id ?? '');
    const [leagueName, setLeagueName] = useState(autoMatch?.leagueName ?? paramName);
    const [season, setSeason] = useState(autoMatch?.season ?? new Date().getFullYear().toString());
    const [buyIn, setBuyIn] = useState('');
    const [teamCount, setTeamCount] = useState(
        autoMatch ? String(autoMatch.totalRosters) : (paramSize || '12')
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    function handleLeagueSelect(id: string) {
        setSelectedLeagueId(id);
        if (!id) { setLeagueName(''); return; }
        const league = syncedLeagues.find(l => l.id === id);
        if (league) {
            setLeagueName(league.leagueName);
            setTeamCount(String(league.totalRosters));
            setSeason(league.season);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!leagueName.trim()) { setError('League name is required.'); return; }
        if (!buyIn || parseFloat(buyIn) <= 0) { setError('Buy-in must be greater than $0.'); return; }

        setLoading(true);
        try {
            const res = await fetch('/api/dues/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscriptionId: subId,
                    leagueName: leagueName.trim(),
                    season,
                    buyInAmount: parseFloat(buyIn),
                    teamCount: parseInt(teamCount),
                }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'Failed to create tracker.'); return; }
            router.push(`/dashboard/commissioner/dues/${data.id}`);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            {error && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Synced league picker */}
            {syncedLeagues.length > 0 && (
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                        Pick a Synced League <span className="text-gray-500 font-normal">(optional)</span>
                    </label>
                    <select
                        value={selectedLeagueId}
                        onChange={e => handleLeagueSelect(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#C8A951]/60">
                        <option value="">— select a league —</option>
                        {syncedLeagues.map(l => (
                            <option key={l.id} value={l.id}>
                                {l.leagueName} ({l.totalRosters} teams · {l.season})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">League Name</label>
                <input
                    type="text"
                    value={leagueName}
                    onChange={e => setLeagueName(e.target.value)}
                    placeholder="e.g. Monday Night Mayhem"
                    maxLength={80}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Season</label>
                <input
                    type="text"
                    value={season}
                    onChange={e => setSeason(e.target.value)}
                    placeholder="2025"
                    maxLength={4}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Buy-In Per Team</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                        <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={buyIn}
                            onChange={e => setBuyIn(e.target.value)}
                            placeholder="100.00"
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-7 pr-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Number of Teams</label>
                    <select
                        value={teamCount}
                        onChange={e => setTeamCount(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#C8A951]/60">
                        {[8,10,12,14,16,18,20,32].map(n => (
                            <option key={n} value={n}>{n} Teams</option>
                        ))}
                    </select>
                </div>
            </div>

            {buyIn && parseFloat(buyIn) > 0 && (
                <div className="bg-[#C8A951]/10 border border-[#C8A951]/30 rounded-xl px-4 py-3 text-sm">
                    <span className="text-[#C8A951] font-bold">Total Pot: </span>
                    <span className="text-white">${(parseFloat(buyIn) * parseInt(teamCount)).toFixed(2)}</span>
                    <span className="text-gray-400 ml-2">({teamCount} teams × ${parseFloat(buyIn).toFixed(2)})</span>
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold py-3 rounded-xl transition text-sm">
                {loading ? 'Creating...' : 'Create Tracker'}
            </button>
        </form>
    );
}
