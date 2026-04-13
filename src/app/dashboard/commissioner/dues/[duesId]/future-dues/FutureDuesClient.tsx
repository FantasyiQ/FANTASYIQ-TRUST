'use client';

import { useState, useTransition } from 'react';

interface Member {
    id:          string;
    displayName: string;
    teamName:    string | null;
}

interface Obligation {
    id:          string;
    memberId:    string;
    season:      string;
    amount:      number;
    notes:       string | null;
    status:      string;
    paidAt:      Date | string | null;
    paymentMethod: string | null;
    member:      { displayName: string; teamName: string | null };
}

interface FutureTracker {
    id:     string;
    season: string;
}

interface Props {
    duesId:         string;
    currentSeason:  string;   // season of this tracker, e.g. "2025"
    buyInAmount:    number;
    members:        Member[];
    obligations:    Obligation[];
    futureTrackers: FutureTracker[];
}


export default function FutureDuesClient({ duesId, currentSeason, buyInAmount, members, obligations: initial, futureTrackers: initialTrackers }: Props) {
    const [obligations, setObligations] = useState<Obligation[]>(initial);
    const [trackers, setTrackers]       = useState<FutureTracker[]>(initialTrackers);
    const [isPending, startTransition]  = useTransition();
    const [error, setError]             = useState('');

    // Dynamic seasons: next 3 years after the tracker's current season
    const baseYear = parseInt(currentSeason) || new Date().getFullYear();
    const SEASONS = [String(baseYear + 1), String(baseYear + 2), String(baseYear + 3)];
    const preSEASONS = [String(baseYear + 1), String(baseYear + 2)]; // seasons available for pre-pay

    const [tab, setTab] = useState(SEASONS[0]);

    // Add form state
    const [memberId, setMemberId] = useState('');
    const [season, setSeason]     = useState(SEASONS[0]);
    const [amount, setAmount]     = useState(String(buyInAmount));
    const [notes, setNotes]       = useState('');
    const [showForm, setShowForm] = useState(false);

    // Follow-on tracker setup state
    const [trackerCreating, setTrackerCreating] = useState<string | null>(null);

    const tabObligations = obligations.filter(o => o.season === tab);
    const pendingCount   = obligations.filter(o => o.status === 'pending').length;

    function reset() {
        setMemberId(''); setSeason(SEASONS[1]);
        setAmount(String(buyInAmount)); setNotes('');
        setShowForm(false); setError('');
    }

    async function handleAdd() {
        if (!memberId || !season || !amount) return;
        setError('');
        startTransition(async () => {
            const res = await fetch('/api/dues/future-dues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duesId, memberId, season, amount: parseFloat(amount), notes: notes || undefined }),
            });
            const data = await res.json() as Obligation & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to add obligation.'); return; }
            setObligations(prev => [...prev, data]);
            setTab(season);
            reset();
        });
    }

    async function handleRemove(id: string) {
        if (!confirm('Remove this future dues obligation?')) return;
        setError('');
        startTransition(async () => {
            const res = await fetch(`/api/dues/future-dues?id=${id}`, { method: 'DELETE' });
            if (!res.ok) { setError('Failed to remove.'); return; }
            setObligations(prev => prev.filter(o => o.id !== id));
        });
    }

    async function handleMarkPaid(id: string) {
        setError('');
        startTransition(async () => {
            const res = await fetch(`/api/dues/future-dues?id=${id}`, { method: 'PATCH' });
            const data = await res.json() as Obligation & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed.'); return; }
            setObligations(prev => prev.map(o => o.id === id ? { ...o, ...data } : o));
        });
    }

    async function handlePayOnBehalf(id: string) {
        setError('');
        startTransition(async () => {
            const res = await fetch('/api/dues/future-dues/pay-on-behalf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const data = await res.json() as { url?: string; error?: string };
            if (!res.ok || !data.url) { setError(data.error ?? 'Failed.'); return; }
            window.location.href = data.url;
        });
    }

    async function handleCreateTracker(s: string) {
        setTrackerCreating(s);
        setError('');
        try {
            const res = await fetch('/api/dues/follow-on', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceDuesId: duesId, season: s }),
            });
            const data = await res.json() as { id?: string; alreadyExists?: boolean; error?: string };
            if (!res.ok || !data.id) { setError(data.error ?? 'Failed to create tracker.'); return; }
            if (!trackers.find(t => t.season === s)) {
                setTrackers(prev => [...prev, { id: data.id!, season: s }]);
            }
        } catch {
            setError('Something went wrong.');
        } finally {
            setTrackerCreating(null);
        }
    }

    return (
        <div className="space-y-6">

            {/* Season Pre-Pay Setup */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h2 className="font-bold text-white mb-1">Season Pre-Pay</h2>
                <p className="text-gray-400 text-sm mb-4">
                    Create a full dues tracker for a future season so members can pre-pay. Once created, open the tracker to collect dues or manage individual obligations.
                </p>
                <div className="flex gap-3 flex-wrap">
                    {preSEASONS.map(s => {
                        const existing = trackers.find(t => t.season === s);
                        return (
                            <div key={s} className="flex items-center gap-2">
                                {existing ? (
                                    <a href={`/dashboard/commissioner/dues/${existing.id}`}
                                        className="px-5 py-2.5 rounded-xl text-sm font-semibold border bg-green-900/20 border-green-800 text-green-400 transition hover:border-green-600">
                                        ✓ Open {s} Tracker →
                                    </a>
                                ) : (
                                    <button
                                        onClick={() => { void handleCreateTracker(s); }}
                                        disabled={isPending || trackerCreating === s}
                                        className="px-5 py-2.5 rounded-xl text-sm font-semibold border bg-gray-800 border-gray-700 hover:border-[#C8A951]/50 text-gray-300 disabled:opacity-50 transition">
                                        {trackerCreating === s ? 'Creating…' : `+ Create ${s} Tracker`}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-4">
                {SEASONS.map(s => {
                    const seasonObs   = obligations.filter(o => o.season === s);
                    const paidAmt     = seasonObs.filter(o => o.status === 'paid').reduce((acc, o) => acc + o.amount, 0);
                    const pendingAmt  = seasonObs.filter(o => o.status === 'pending').reduce((acc, o) => acc + o.amount, 0);
                    return (
                        <button key={s} type="button" onClick={() => setTab(s)}
                            className={`bg-gray-900 border rounded-2xl p-4 text-left transition ${tab === s ? 'border-[#C8A951]/50' : 'border-gray-800 hover:border-gray-700'}`}>
                            <p className="text-gray-400 text-xs font-semibold mb-1">{s} Season</p>
                            <p className="text-white font-bold text-lg">{seasonObs.length} <span className="text-gray-500 text-sm font-normal">obligations</span></p>
                            <div className="mt-1 text-xs space-x-2">
                                {pendingAmt > 0 && <span className="text-red-400">${pendingAmt.toFixed(2)} pending</span>}
                                {paidAmt > 0    && <span className="text-green-400">${paidAmt.toFixed(2)} paid</span>}
                                {seasonObs.length === 0 && <span className="text-gray-700">None logged</span>}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Obligations table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                    <h2 className="font-bold">{tab} Future Dues</h2>
                    <button
                        onClick={() => { setShowForm(v => !v); setError(''); }}
                        className="text-sm border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-3 py-1.5 rounded-lg transition">
                        {showForm ? 'Cancel' : '+ Add Obligation'}
                    </button>
                </div>

                {/* Add form */}
                {showForm && (
                    <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/30 space-y-3">
                        <p className="text-xs text-amber-400/80 font-medium">
                            Log a team that traded away a future pick and will owe dues in that season.
                        </p>
                        <div className="grid sm:grid-cols-4 gap-3">
                            <div className="sm:col-span-2">
                                <label className="text-gray-500 text-xs block mb-1">Team</label>
                                <select value={memberId} onChange={e => setMemberId(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C8A951]/60">
                                    <option value="">Select team…</option>
                                    {members.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.displayName}{m.teamName ? ` — ${m.teamName}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-gray-500 text-xs block mb-1">Season</label>
                                <select value={season} onChange={e => setSeason(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C8A951]/60">
                                    {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-gray-500 text-xs block mb-1">Amount ($)</label>
                                <input type="number" step="0.01" min="0" value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C8A951]/60" />
                            </div>
                        </div>
                        <div>
                            <label className="text-gray-500 text-xs block mb-1">Notes <span className="text-gray-700">(optional — e.g. "Has 2027 1st round pick from Team A")</span></label>
                            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                                maxLength={200} placeholder="Reason for future dues obligation…"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60" />
                        </div>
                        {error && <p className="text-red-400 text-xs">{error}</p>}
                        <div className="flex gap-2">
                            <button onClick={() => { void handleAdd(); }}
                                disabled={isPending || !memberId || !season || !amount}
                                className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50">
                                {isPending ? 'Adding…' : 'Add Obligation'}
                            </button>
                            <button onClick={reset} className="text-gray-500 hover:text-gray-300 text-sm px-3 py-2 rounded-lg transition">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Obligations list */}
                {tabObligations.length === 0 ? (
                    <div className="px-6 py-10 text-center text-gray-500 text-sm">
                        No future dues obligations logged for {tab}.<br />
                        <span className="text-gray-700 text-xs">Use the Add Obligation button to track teams that traded away future picks.</span>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-800/50">
                        {tabObligations.map(o => (
                            <li key={o.id} className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-white text-sm">{o.member.displayName}</p>
                                    {o.member.teamName && <p className="text-gray-500 text-xs mt-0.5">{o.member.teamName}</p>}
                                    {o.notes && (
                                        <p className="text-gray-600 text-xs mt-1 italic">{o.notes}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                                    <span className="text-white font-bold text-sm">${o.amount.toFixed(2)}</span>
                                    {o.status === 'paid' ? (
                                        <div className="text-right">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-900/40 text-green-400 border border-green-800">
                                                ✓ Paid
                                            </span>
                                            {o.paidAt && (
                                                <p className="text-gray-600 text-xs mt-0.5">
                                                    {o.paymentMethod === 'stripe_on_behalf' ? 'Via Stripe · ' : 'Manual · '}
                                                    {new Date(o.paidAt).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-900/30 text-red-400 border border-red-900">
                                                Unpaid
                                            </span>
                                            <button onClick={() => { void handlePayOnBehalf(o.id); }} disabled={isPending}
                                                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                                                Pay on Behalf →
                                            </button>
                                            <button onClick={() => { void handleMarkPaid(o.id); }} disabled={isPending}
                                                className="text-xs border border-gray-700 hover:border-green-700 text-gray-400 hover:text-green-400 font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                                                Mark Paid
                                            </button>
                                            <button onClick={() => { void handleRemove(o.id); }} disabled={isPending}
                                                className="text-gray-700 hover:text-red-400 text-xs transition disabled:opacity-50">
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {pendingCount > 0 && (
                <p className="text-gray-600 text-xs text-center">
                    {pendingCount} obligation{pendingCount !== 1 ? 's' : ''} pending across all seasons
                </p>
            )}

        </div>
    );
}
