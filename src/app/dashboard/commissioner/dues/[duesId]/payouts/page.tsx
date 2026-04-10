'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface PayoutSpot {
    id?: string;
    label: string;
    amount: string;
    sortOrder: number;
}

interface DuesInfo {
    leagueName: string;
    buyInAmount: number;
    teamCount: number;
    potTotal: number;
    members: { id: string; displayName: string; duesStatus: string }[];
    payoutSpots: { id: string; label: string; amount: number; sortOrder: number }[];
}

export default function PayoutSpotsPage() {
    const router = useRouter();
    const params = useParams();
    const duesId = params.duesId as string;

    const [dues, setDues] = useState<DuesInfo | null>(null);
    const [spots, setSpots] = useState<PayoutSpot[]>([{ label: '1st Place', amount: '', sortOrder: 0 }]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetch(`/api/dues/${duesId}`)
            .then(r => r.json())
            .then((data: DuesInfo) => {
                setDues(data);
                if (data.payoutSpots.length > 0) {
                    setSpots(data.payoutSpots.map(s => ({ id: s.id, label: s.label, amount: s.amount.toString(), sortOrder: s.sortOrder })));
                }
                setLoading(false);
            });
    }, [duesId]);

    const fullPot = dues ? dues.buyInAmount * dues.teamCount : 0;
    const totalAllocated = spots.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const remaining = fullPot - totalAllocated;

    function addSpot() {
        setSpots(prev => [...prev, { label: '', amount: '', sortOrder: prev.length }]);
    }

    function removeSpot(i: number) {
        setSpots(prev => prev.filter((_, idx) => idx !== i));
    }

    function updateSpot(i: number, field: 'label' | 'amount', value: string) {
        setSpots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
    }

    async function handleSave() {
        setError(''); setSuccess('');
        for (const s of spots) {
            if (!s.label.trim()) { setError('All spots need a label.'); return; }
            if (!s.amount || parseFloat(s.amount) <= 0) { setError('All spots need an amount greater than $0.'); return; }
        }
        if (Math.abs(remaining) > 0.01) {
            setError(`Payout spots must equal the full pot ($${fullPot.toFixed(2)}). You have $${Math.abs(remaining).toFixed(2)} ${remaining > 0 ? 'unallocated' : 'over-allocated'}.`);
            return;
        }

        setSaving(true);
        const res = await fetch(`/api/dues/${duesId}/payouts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spots: spots.map((s, i) => ({ id: s.id, label: s.label, amount: parseFloat(s.amount), sortOrder: i })) }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return; }
        setSuccess('Payout spots saved.');
        setSaving(false);
        router.refresh();
    }

    async function generateProposal() {
        setSaving(true); setError('');
        const res = await fetch(`/api/dues/${duesId}/proposal/generate`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to generate proposal.'); setSaving(false); return; }
        router.push(`/dashboard/commissioner/dues/${duesId}/proposal`);
    }

    if (loading) return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto text-gray-500">Loading...</div>
        </main>
    );

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto space-y-6">
                <div>
                    <Link href={`/dashboard/commissioner/dues/${duesId}`} className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Tracker
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Payout Spots</h1>
                    <p className="text-gray-400 text-sm mt-1">{dues?.leagueName} · Full pot: ${fullPot.toFixed(2)}</p>
                </div>

                {error && <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
                {success && <div className="bg-green-900/20 border border-green-800/50 rounded-xl px-4 py-3 text-green-400 text-sm">{success}</div>}

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    {spots.map((spot, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <span className="text-gray-600 text-sm w-5 text-right">{i + 1}.</span>
                            <input
                                type="text"
                                value={spot.label}
                                onChange={e => updateSpot(i, 'label', e.target.value)}
                                placeholder="e.g. 1st Place"
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                            />
                            <div className="relative w-36">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={spot.amount}
                                    onChange={e => updateSpot(i, 'amount', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-7 pr-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                                />
                            </div>
                            {spots.length > 1 && (
                                <button onClick={() => removeSpot(i)} className="text-gray-700 hover:text-red-400 text-sm transition">✕</button>
                            )}
                        </div>
                    ))}

                    <button onClick={addSpot} className="text-sm text-[#C8A951] hover:underline mt-1">+ Add Spot</button>

                    <div className={`flex items-center justify-between text-sm font-semibold pt-3 border-t border-gray-800 ${Math.abs(remaining) < 0.01 ? 'text-green-400' : 'text-yellow-400'}`}>
                        <span>Allocated</span>
                        <span>${totalAllocated.toFixed(2)} / ${fullPot.toFixed(2)}</span>
                    </div>
                    {Math.abs(remaining) > 0.01 && (
                        <p className="text-yellow-400 text-xs">${Math.abs(remaining).toFixed(2)} {remaining > 0 ? 'remaining to allocate' : 'over pot total'}</p>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold py-3 rounded-xl transition text-sm">
                        {saving ? 'Saving...' : 'Save Payout Spots'}
                    </button>
                </div>

                {/* Generate proposal once pot is whole and spots are saved */}
                {dues && dues.payoutSpots.length > 0 && dues.potTotal >= fullPot && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center space-y-3">
                        <h2 className="font-bold text-lg">Season Ended?</h2>
                        <p className="text-gray-400 text-sm">Generate the payout proposal based on your payout spots. You'll review and approve before any payments go out.</p>
                        <button
                            onClick={generateProposal}
                            disabled={saving}
                            className="bg-white text-black font-bold px-6 py-2.5 rounded-xl hover:bg-gray-100 transition text-sm disabled:opacity-50">
                            Generate Payout Proposal →
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
