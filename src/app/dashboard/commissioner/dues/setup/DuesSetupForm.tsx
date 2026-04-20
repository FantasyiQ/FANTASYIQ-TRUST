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
    const subId     = params.get('subId') ?? '';
    const paramName = params.get('leagueName') ?? '';
    const paramSize = params.get('leagueSize') ?? '';
    const isPreFilled = !!paramName;

    // Auto-match a synced league by name (case-insensitive)
    const autoMatch = paramName
        ? syncedLeagues.find(l => l.leagueName.toLowerCase() === paramName.toLowerCase())
        : null;

    const [selectedLeagueId, setSelectedLeagueId] = useState(autoMatch?.id ?? '');
    const [leagueName, setLeagueName] = useState(autoMatch?.leagueName ?? paramName);
    const [buyIn, setBuyIn] = useState('');
    const [teamCount, setTeamCount] = useState(
        autoMatch ? String(autoMatch.totalRosters) : (paramSize || '12')
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // Payment model preference — stored as informational; both paths remain available
    const [paymentModel, setPaymentModel] = useState<'stripe' | 'manual'>('stripe');

    // Season checkboxes — default to the auto-matched season, else current year
    const baseYear = parseInt(autoMatch?.season ?? new Date().getFullYear().toString());
    const seasonOptions = [baseYear, baseYear + 1, baseYear + 2].map(String);
    const [selectedSeasons, setSelectedSeasons] = useState<string[]>([String(baseYear)]);

    function toggleSeason(s: string) {
        setSelectedSeasons(prev =>
            prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s].sort()
        );
    }

    function handleLeagueSelect(id: string) {
        setSelectedLeagueId(id);
        if (!id) { setLeagueName(''); return; }
        const league = syncedLeagues.find(l => l.id === id);
        if (league) {
            setLeagueName(league.leagueName);
            setTeamCount(String(league.totalRosters));
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!leagueName.trim()) { setError('League name is required.'); return; }
        if (!buyIn || parseFloat(buyIn) <= 0) { setError('Buy-in must be greater than $0.'); return; }
        if (!selectedSeasons.length) { setError('Select at least one season.'); return; }

        setLoading(true);
        try {
            const res = await fetch('/api/dues/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscriptionId: subId,
                    leagueName: leagueName.trim(),
                    seasons: selectedSeasons,
                    buyInAmount: parseFloat(buyIn),
                    teamCount: parseInt(teamCount),
                }),
            });
            const data = await res.json() as { id?: string; error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to create tracker.'); return; }
            router.push(`/dashboard/commissioner/dues/${data.id}`);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    const perMemberTotal = buyIn && parseFloat(buyIn) > 0
        ? parseFloat(buyIn) * selectedSeasons.length
        : null;

    return (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            {error && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Payment model selection */}
            <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">How will members pay?</label>
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={() => setPaymentModel('stripe')}
                        className={`w-full text-left px-4 py-3.5 rounded-xl border transition ${
                            paymentModel === 'stripe'
                                ? 'border-[#C8A951]/60 bg-[#C8A951]/8'
                                : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                paymentModel === 'stripe' ? 'border-[#C8A951]' : 'border-gray-600'
                            }`}>
                                {paymentModel === 'stripe' && <span className="w-2 h-2 rounded-full bg-[#C8A951] block" />}
                            </span>
                            <div>
                                <p className="text-white text-sm font-semibold">
                                    Member-Direct Payments
                                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#C8A951]/15 text-[#C8A951] border border-[#C8A951]/30">RECOMMENDED</span>
                                </p>
                                <p className="text-gray-500 text-xs mt-0.5">Each member pays through their own account via Stripe. Automatic tracking, full transparency.</p>
                            </div>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPaymentModel('manual')}
                        className={`w-full text-left px-4 py-3.5 rounded-xl border transition ${
                            paymentModel === 'manual'
                                ? 'border-gray-600 bg-gray-800/60'
                                : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                paymentModel === 'manual' ? 'border-gray-400' : 'border-gray-600'
                            }`}>
                                {paymentModel === 'manual' && <span className="w-2 h-2 rounded-full bg-gray-400 block" />}
                            </span>
                            <div>
                                <p className="text-gray-400 text-sm font-semibold">Manual Payments (Cash / Venmo)</p>
                                <p className="text-gray-600 text-xs mt-0.5">Commissioner collects and enters payments manually. Less transparent — not automatically verified.</p>
                            </div>
                        </div>
                    </button>
                </div>
                {paymentModel === 'manual' && (
                    <p className="text-amber-500/80 text-xs flex items-start gap-1.5 bg-amber-900/10 border border-amber-900/30 rounded-lg px-3 py-2">
                        <span className="shrink-0 mt-0.5">⚠</span>
                        Manual payments are not automatically verified and rely on commissioner accuracy. Members can still pay via Stripe if they choose.
                    </p>
                )}
            </div>

            {/* Synced league picker — hidden when pre-filled from commissioner plan */}
            {!isPreFilled && syncedLeagues.length > 0 && (
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

            {/* Season selection — up to 3 years */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Seasons <span className="text-gray-500 font-normal text-xs">(select up to 3 for multi-year pre-pay)</span>
                </label>
                <div className="flex gap-3">
                    {seasonOptions.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => toggleSeason(s)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
                                selectedSeasons.includes(s)
                                    ? 'bg-[#C8A951] text-black border-[#C8A951]'
                                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                            }`}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Buy-In Per Team / Season</label>
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
                <div className="bg-[#C8A951]/10 border border-[#C8A951]/30 rounded-xl px-4 py-3 space-y-1 text-sm">
                    <div>
                        <span className="text-[#C8A951] font-bold">Pot Per Season: </span>
                        <span className="text-white">${(parseFloat(buyIn) * parseInt(teamCount)).toFixed(2)}</span>
                        <span className="text-gray-400 ml-2">({teamCount} teams × ${parseFloat(buyIn).toFixed(2)})</span>
                    </div>
                    {selectedSeasons.length > 1 && perMemberTotal && (
                        <div>
                            <span className="text-[#C8A951] font-bold">Per Member ({selectedSeasons.length} seasons): </span>
                            <span className="text-white">${perMemberTotal.toFixed(2)}</span>
                        </div>
                    )}
                </div>
            )}

            <button
                type="submit"
                disabled={loading || !selectedSeasons.length}
                className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold py-3 rounded-xl transition text-sm">
                {loading ? 'Creating...' : selectedSeasons.length > 1 ? `Create ${selectedSeasons.length} Trackers` : 'Create Tracker'}
            </button>
        </form>
    );
}
