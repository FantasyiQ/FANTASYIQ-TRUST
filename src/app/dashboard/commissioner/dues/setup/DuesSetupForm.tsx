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
    stripeConnected: boolean;
}

export default function DuesSetupForm({ syncedLeagues, stripeConnected }: Props) {
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
    const [paymentModel, setPaymentModel] = useState<'stripe' | 'manual'>('stripe');
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState('');

    // Payout spots
    interface PayoutSpot { label: string; amount: string; }
    const [spots, setSpots] = useState<PayoutSpot[]>([{ label: '1st Place', amount: '' }]);

    function addSpot() {
        const labels = ['2nd Place', '3rd Place', '4th Place', '5th Place'];
        const label = labels[spots.length - 1] ?? '';
        setSpots(prev => [...prev, { label, amount: '' }]);
    }
    function removeSpot(i: number) {
        setSpots(prev => prev.filter((_, idx) => idx !== i));
    }
    function updateSpot(i: number, field: 'label' | 'amount', value: string) {
        setSpots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
    }

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

    async function connectStripe() {
        setConnectError('');
        setConnecting(true);
        try {
            const res  = await fetch('/api/stripe/connect/commissioner-onboard', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ returnPath: '/dashboard/commissioner/dues/setup' }),
            });
            const data = await res.json() as { url?: string; error?: string };
            if (!res.ok || !data.url) { setConnectError(data.error ?? 'Could not start Stripe onboarding.'); return; }
            window.location.href = data.url;
        } catch {
            setConnectError('Network error — please try again.');
        } finally {
            setConnecting(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!leagueName.trim()) { setError('League name is required.'); return; }
        if (!buyIn || parseFloat(buyIn) <= 0) { setError('Buy-in must be greater than $0.'); return; }
        if (!selectedSeasons.length) { setError('Select at least one season.'); return; }
        if (paymentModel === 'stripe' && !stripeConnected) {
            setError('Connect your Stripe account first — see above.');
            return;
        }

        // Validate payout spots if any amounts filled in
        const filledSpots = spots.filter(s => s.amount && parseFloat(s.amount) > 0);
        if (filledSpots.length > 0) {
            const pot = parseFloat(buyIn) * parseInt(teamCount);
            const allocated = filledSpots.reduce((sum, s) => sum + parseFloat(s.amount), 0);
            if (Math.abs(pot - allocated) > 0.01) {
                setError(`Payout spots must equal the full pot ($${pot.toFixed(2)}). Currently $${allocated.toFixed(2)} allocated.`);
                return;
            }
            for (const s of filledSpots) {
                if (!s.label.trim()) { setError('All payout spots need a label.'); return; }
            }
        }

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
                    paymentModel,
                }),
            });
            const data = await res.json() as { id?: string; ids?: string[]; error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to create tracker.'); return; }

            // Save payout spots to each created tracker if configured
            if (filledSpots.length > 0) {
                const ids = data.ids ?? (data.id ? [data.id] : []);
                await Promise.all(ids.map(id =>
                    fetch(`/api/dues/${id}/payouts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            spots: filledSpots.map((s, i) => ({ label: s.label.trim(), amount: parseFloat(s.amount), sortOrder: i })),
                        }),
                    })
                ));
            }

            const firstId = data.id ?? data.ids?.[0];
            router.push(`/dashboard/commissioner/dues/${firstId}`);
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
                                ? 'border-[#D4AF37]/60 bg-[#D4AF37]/8'
                                : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                paymentModel === 'stripe' ? 'border-[#D4AF37]' : 'border-gray-600'
                            }`}>
                                {paymentModel === 'stripe' && <span className="w-2 h-2 rounded-full bg-[#D4AF37] block" />}
                            </span>
                            <div>
                                <p className="text-white text-sm font-semibold">
                                    Member-Direct Payments
                                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">RECOMMENDED</span>
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
                {paymentModel === 'stripe' && (
                    stripeConnected ? (
                        <p className="text-emerald-400/90 text-xs flex items-start gap-1.5 bg-emerald-900/10 border border-emerald-900/30 rounded-lg px-3 py-2">
                            <span className="shrink-0 mt-0.5">✓</span>
                            Your Stripe account is connected — dues route directly to you, never through FiQ.
                        </p>
                    ) : (
                        <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/25 rounded-lg px-3 py-3 space-y-2">
                            <p className="text-gray-300 text-xs">
                                Connect your own Stripe account first — member payments go straight to you, so FiQ never holds your league&apos;s money.
                            </p>
                            <button
                                type="button"
                                onClick={() => { void connectStripe(); }}
                                disabled={connecting}
                                className="bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-50 text-gray-950 font-bold px-4 py-2 rounded-lg text-sm transition"
                            >
                                {connecting ? 'Redirecting…' : 'Connect your Stripe account →'}
                            </button>
                            {connectError && <p className="text-red-400 text-xs">{connectError}</p>}
                        </div>
                    )
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
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#D4AF37]/60">
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D4AF37]/60"
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
                                    ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
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
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-7 pr-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D4AF37]/60"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Number of Teams</label>
                    <select
                        value={teamCount}
                        onChange={e => setTeamCount(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#D4AF37]/60">
                        {[8,10,12,14,16,18,20,32].map(n => (
                            <option key={n} value={n}>{n} Teams</option>
                        ))}
                    </select>
                </div>
            </div>

            {buyIn && parseFloat(buyIn) > 0 && (
                <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl px-4 py-3 space-y-1 text-sm">
                    <div>
                        <span className="text-[#D4AF37] font-bold">Pot Per Season: </span>
                        <span className="text-white">${(parseFloat(buyIn) * parseInt(teamCount)).toFixed(2)}</span>
                        <span className="text-gray-400 ml-2">({teamCount} teams × ${parseFloat(buyIn).toFixed(2)})</span>
                    </div>
                    {selectedSeasons.length > 1 && perMemberTotal && (
                        <div>
                            <span className="text-[#D4AF37] font-bold">Per Member ({selectedSeasons.length} seasons): </span>
                            <span className="text-white">${perMemberTotal.toFixed(2)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Payout spots */}
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Payout Spots</label>
                    <p className="text-gray-500 text-xs mt-0.5">
                        Optional — configure now or after creation.
                        {buyIn && parseFloat(buyIn) > 0 && ` Full pot: $${(parseFloat(buyIn) * parseInt(teamCount)).toFixed(2)}`}
                    </p>
                </div>

                <div className="space-y-2">
                    {spots.map((spot, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className="text-gray-600 text-xs w-4 text-right shrink-0">{i + 1}.</span>
                            <input
                                type="text"
                                value={spot.label}
                                onChange={e => updateSpot(i, 'label', e.target.value)}
                                placeholder={i === 0 ? '1st Place' : i === 1 ? '2nd Place' : 'Label'}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D4AF37]/60"
                            />
                            <div className="relative w-32 shrink-0">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={spot.amount}
                                    onChange={e => updateSpot(i, 'amount', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-7 pr-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D4AF37]/60"
                                />
                            </div>
                            {spots.length > 1 && (
                                <button type="button" onClick={() => removeSpot(i)} className="text-gray-700 hover:text-red-400 text-sm transition shrink-0">✕</button>
                            )}
                        </div>
                    ))}
                </div>

                {(() => {
                    const pot = buyIn && parseFloat(buyIn) > 0 ? parseFloat(buyIn) * parseInt(teamCount) : 0;
                    const allocated = spots.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
                    const remaining = pot - allocated;
                    const anyFilled = spots.some(s => parseFloat(s.amount) > 0);
                    return (
                        <div className="flex items-center justify-between">
                            <button type="button" onClick={addSpot} className="text-sm text-[#D4AF37] hover:underline">
                                + Add Spot
                            </button>
                            {pot > 0 && anyFilled && (
                                <span className={`text-xs font-semibold ${Math.abs(remaining) < 0.01 ? 'text-green-400' : 'text-yellow-400'}`}>
                                    ${allocated.toFixed(2)} / ${pot.toFixed(2)}
                                    {Math.abs(remaining) > 0.01 && ` · $${Math.abs(remaining).toFixed(2)} ${remaining > 0 ? 'left' : 'over'}`}
                                </span>
                            )}
                        </div>
                    );
                })()}
            </div>

            <button
                type="submit"
                disabled={loading || !selectedSeasons.length || (paymentModel === 'stripe' && !stripeConnected)}
                className="w-full bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-50 text-black font-bold py-3 rounded-xl transition text-sm">
                {loading ? 'Creating...' : selectedSeasons.length > 1 ? `Create ${selectedSeasons.length} Trackers` : 'Create Tracker'}
            </button>
        </form>
    );
}
