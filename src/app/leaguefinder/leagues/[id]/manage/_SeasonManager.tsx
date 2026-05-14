'use client';

import { useState } from 'react';

interface Season {
    id:         string;
    year:       number;
    champion:   string | null;
    payoutSent: boolean;
    payoutDate: string | null;
    notes:      string | null;
}

interface Props {
    leagueId:       string;
    initialSeasons: Season[];
}

export default function SeasonManager({ leagueId, initialSeasons }: Props) {
    const [seasons, setSeasons] = useState(initialSeasons);
    const [adding,  setAdding]  = useState(false);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    // New season form state
    const [year,       setYear]       = useState(new Date().getFullYear());
    const [champion,   setChampion]   = useState('');
    const [payoutSent, setPayoutSent] = useState(false);
    const [notes,      setNotes]      = useState('');

    async function addSeason() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/lf/leagues/${leagueId}/seasons`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ year, champion: champion || null, payoutSent, notes: notes || null }),
            });
            if (res.ok) {
                const data = await res.json() as Season;
                setSeasons(prev => [data, ...prev]);
                setAdding(false);
                setChampion(''); setNotes(''); setPayoutSent(false);
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error ?? 'Error adding season');
            }
        } catch { setError('Network error'); }
        finally  { setLoading(false); }
    }

    async function removeSeason(id: string) {
        await fetch(`/api/lf/seasons/${id}`, { method: 'DELETE' });
        setSeasons(prev => prev.filter(s => s.id !== id));
    }

    async function togglePayout(season: Season) {
        const newVal = !season.payoutSent;
        await fetch(`/api/lf/seasons/${season.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ payoutSent: newVal }),
        });
        setSeasons(prev => prev.map(s => s.id === season.id ? { ...s, payoutSent: newVal } : s));
    }

    return (
        <div className="space-y-3">
            {/* Existing seasons */}
            {seasons.length > 0 && (
                <div className="space-y-2">
                    {seasons.map(s => (
                        <div key={s.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">{s.year} Season</span>
                                    <button
                                        onClick={() => togglePayout(s)}
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition ${
                                            s.payoutSent
                                                ? 'text-emerald-400 border-emerald-800 bg-emerald-900/20'
                                                : 'text-gray-500 border-gray-700 bg-gray-800 hover:border-gray-500'
                                        }`}
                                    >
                                        {s.payoutSent ? '✓ Paid out' : 'Mark paid'}
                                    </button>
                                </div>
                                {s.champion && <div className="text-xs text-gray-400">🏆 {s.champion}</div>}
                                {s.notes    && <div className="text-xs text-gray-600">{s.notes}</div>}
                            </div>
                            <button
                                onClick={() => removeSeason(s.id)}
                                className="text-[10px] text-red-800 hover:text-red-600 transition shrink-0"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add form */}
            {adding ? (
                <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 space-y-3">
                    <h3 className="text-xs font-bold text-white">Add Season</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] text-gray-500 block mb-1">Year</label>
                            <input
                                type="number" min={2000} max={2100}
                                value={year} onChange={e => setYear(parseInt(e.target.value))}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 block mb-1">Champion (optional)</label>
                            <input
                                value={champion} onChange={e => setChampion(e.target.value)}
                                placeholder="Team / player name"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Notes (optional)</label>
                        <input
                            value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="Rule changes, highlights, etc."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox" checked={payoutSent}
                            onChange={e => setPayoutSent(e.target.checked)}
                            className="accent-[#D4AF37]"
                        />
                        <span className="text-xs text-gray-400">Payout sent</span>
                    </label>
                    {error && <p className="text-xs text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <button
                            onClick={addSeason} disabled={loading}
                            className="px-4 py-2 rounded-lg text-xs font-bold bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
                        >
                            {loading ? 'Saving…' : 'Add Season'}
                        </button>
                        <button
                            onClick={() => setAdding(false)}
                            className="text-xs text-gray-600 hover:text-gray-300 transition"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setAdding(true)}
                    className="text-xs text-gray-500 hover:text-[#D4AF37] border border-dashed border-gray-700 hover:border-[#D4AF37]/40 rounded-xl px-4 py-3 w-full transition"
                >
                    + Add Season Record
                </button>
            )}
        </div>
    );
}
