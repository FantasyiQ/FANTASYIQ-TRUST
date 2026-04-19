'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import InviteLinkButton from '@/components/InviteLinkButton';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DuesMemberRow {
    id: string;
    userId?: string | null;
    displayName: string;
    teamName?: string | null;
    duesStatus: string;
    paymentMethod?: string | null;
}

export interface DuesManagerData {
    id: string;
    buyInAmount: number;
    collectedAmount: number;
    potTotal: number;
    status: string;
    teamCount: number;
    payoutSpots: { label: string; amount: number; sortOrder: number }[];
    members: DuesMemberRow[];
}

export interface SleeperMember {
    displayName: string;
    teamName: string;
}

interface Props {
    initialDuesData: DuesManagerData | null;
    isCommissioner: boolean;
    currentUserId?: string;
    canInvite: boolean;
    leagueName: string;
    season: string;
    sleeperLeagueId: string;
    totalRosters: number;
    sleeperMembers: SleeperMember[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DUES_STATUS_LABEL: Record<string, string> = {
    setup:            'Setting Up',
    active:           'Active',
    season_ended:     'Season Ended',
    pending_approval: 'Pending Approval',
    approved:         'Approved',
    paid_out:         'Paid Out',
};

function defaultPayoutSpots(pot: number) {
    if (pot <= 0) return [
        { label: '1st Place', amount: '' },
        { label: '2nd Place', amount: '' },
        { label: '3rd Place', amount: '' },
    ];
    const first  = Math.round(pot * 0.6 * 100) / 100;
    const second = Math.round(pot * 0.3 * 100) / 100;
    const third  = Math.round((pot - first - second) * 100) / 100;
    return [
        { label: '1st Place', amount: String(first) },
        { label: '2nd Place', amount: String(second) },
        { label: '3rd Place', amount: String(third) },
    ];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DuesManager({
    initialDuesData,
    isCommissioner,
    currentUserId,
    canInvite,
    leagueName,
    season,
    sleeperLeagueId,
    totalRosters,
    sleeperMembers,
}: Props) {
    const router = useRouter();

    // ── Live dues state (syncs when server re-renders) ──────────────────────
    const [duesData, setDuesData]           = useState(initialDuesData);
    const [members, setMembers]             = useState<DuesMemberRow[]>(initialDuesData?.members ?? []);
    const [potTotal, setPotTotal]           = useState(initialDuesData?.potTotal ?? 0);
    const [collectedAmount, setCollected]   = useState(initialDuesData?.collectedAmount ?? 0);

    useEffect(() => {
        setDuesData(initialDuesData);
        setMembers(initialDuesData?.members ?? []);
        setPotTotal(initialDuesData?.potTotal ?? 0);
        setCollected(initialDuesData?.collectedAmount ?? 0);
    }, [initialDuesData]);

    // ── Setup form state ────────────────────────────────────────────────────
    const [showSetup, setShowSetup]   = useState(false);
    const [buyIn, setBuyIn]           = useState('');
    const [payoutSpots, setPayoutSpots] = useState<{ label: string; amount: string }[]>([
        { label: '1st Place', amount: '' },
        { label: '2nd Place', amount: '' },
        { label: '3rd Place', amount: '' },
    ]);
    const [setupSaving, setSetupSaving] = useState(false);
    const [setupError, setSetupError]   = useState('');

    // Recalculate default payout amounts when buy-in changes
    const potPreview = buyIn ? parseFloat(buyIn) * totalRosters : 0;

    // ── Payment toggle state ────────────────────────────────────────────────
    const [togglingId, setTogglingId]     = useState<string | null>(null);
    const [toggleError, setToggleError]   = useState<string | null>(null);

    // ── Add to Pot state ────────────────────────────────────────────────────
    const [addAmount, setAddAmount]       = useState('');
    const [addSaving, setAddSaving]       = useState(false);
    const [addError, setAddError]         = useState('');
    const [addInputShake, setAddInputShake] = useState(false);

    // ── Stripe dues payment state ────────────────────────────────────────
    const [payingDues, setPayingDues]     = useState(false);
    const [payError, setPayError]         = useState('');
    const [showPaidBanner, setShowPaidBanner]     = useState(false);
    const [showCancelledBanner, setShowCancelledBanner] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('dues_paid') === 'true') {
            setShowPaidBanner(true);
            const url = new URL(window.location.href);
            url.searchParams.delete('dues_paid');
            window.history.replaceState({}, '', url.toString());
        }
        if (sp.get('dues_cancelled') === 'true') {
            setShowCancelledBanner(true);
            const url = new URL(window.location.href);
            url.searchParams.delete('dues_cancelled');
            window.history.replaceState({}, '', url.toString());
        }
    }, []);


    // ── Setup form handlers ─────────────────────────────────────────────────

    function addPayoutLine() {
        setPayoutSpots(prev => [...prev, { label: '', amount: '' }]);
    }

    function removePayoutLine(i: number) {
        setPayoutSpots(prev => prev.filter((_, idx) => idx !== i));
    }

    function updatePayoutSpot(i: number, field: 'label' | 'amount', val: string) {
        setPayoutSpots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
    }

    // Auto-fill default payout amounts when buy-in is entered
    function handleBuyInChange(val: string) {
        setBuyIn(val);
        const pot = val ? parseFloat(val) * totalRosters : 0;
        if (pot > 0) setPayoutSpots(defaultPayoutSpots(pot));
    }

    async function handleSetupSave(e: React.FormEvent) {
        e.preventDefault();
        setSetupError('');

        const buyInNum = parseFloat(buyIn);
        if (!buyIn || isNaN(buyInNum) || buyInNum <= 0) {
            setSetupError('Enter a valid buy-in amount.');
            return;
        }

        const validSpots = payoutSpots
            .filter(s => s.label.trim() && parseFloat(s.amount) > 0)
            .map(s => ({ label: s.label.trim(), amount: parseFloat(s.amount) }));

        setSetupSaving(true);
        try {
            const res = await fetch('/api/dues/league-init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leagueName,
                    season,
                    buyInAmount: buyInNum,
                    teamCount: totalRosters,
                    payoutSpots: validSpots,
                    members: sleeperMembers,
                }),
            });
            const data = await res.json() as { id?: string; error?: string };
            if (!res.ok) { setSetupError(data.error ?? 'Failed to save.'); return; }
            setShowSetup(false);
            router.refresh();
        } catch {
            setSetupError('Something went wrong. Please try again.');
        } finally {
            setSetupSaving(false);
        }
    }

    // ── Add to Pot ──────────────────────────────────────────────────────────

    async function handleAddToPot(e: React.FormEvent) {
        e.preventDefault();
        if (!duesData || addSaving) return;
        const amount = parseFloat(addAmount);
        if (!addAmount || isNaN(amount) || amount <= 0) {
            setAddError('Enter a valid amount.');
            return;
        }
        setAddError('');
        setAddSaving(true);
        try {
            const res = await fetch(`/api/dues/${duesData.id}/collect`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount }),
            });
            const data = await res.json() as { collectedAmount?: number; error?: string };
            if (!res.ok) { setAddError(data.error ?? 'Failed to add.'); return; }
            setCollected(data.collectedAmount ?? collectedAmount + amount);
            setAddAmount('');
            setToggleError(null);
        } catch {
            setAddError('Network error — please try again.');
        } finally {
            setAddSaving(false);
        }
    }

    // ── Stripe dues payment ─────────────────────────────────────────────────

    async function handlePayDues() {
        if (!duesData || payingDues) return;
        setPayingDues(true);
        setPayError('');
        try {
            const res = await fetch(`/api/dues/${duesData.id}/pay`, { method: 'POST' });
            const data = await res.json() as { url?: string; error?: string };
            if (!res.ok || !data.url) {
                setPayError(data.error ?? 'Could not start payment. Please try again.');
                return;
            }
            window.location.href = data.url;
        } catch {
            setPayError('Network error — please try again.');
        } finally {
            setPayingDues(false);
        }
    }

    // ── Payment toggle ──────────────────────────────────────────────────────

    async function toggleMemberStatus(memberId: string, currentStatus: string) {
        if (togglingId || !duesData) return;
        const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
        setTogglingId(memberId);
        setToggleError(null);

        // Optimistic update for paid→unpaid only; wait for server on unpaid→paid
        const goingPaid = newStatus === 'paid';
        if (!goingPaid) {
            setMembers(prev => prev.map(m => m.id === memberId ? { ...m, duesStatus: newStatus } : m));
            setPotTotal(prev => prev - duesData.buyInAmount);
        }

        try {
            const res = await fetch(`/api/dues/${duesData.id}/member-status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId, status: newStatus }),
            });
            if (!res.ok) {
                const data = await res.json() as { error?: string };
                if (res.status === 409) {
                    // Pot insufficient — show error and highlight Add to Pot input
                    setToggleError(data.error ?? 'Add funds to the pot first.');
                    setAddInputShake(true);
                    setTimeout(() => setAddInputShake(false), 600);
                }
                // Revert optimistic update if we made one
                if (!goingPaid) {
                    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, duesStatus: currentStatus } : m));
                    setPotTotal(prev => prev + duesData.buyInAmount);
                }
            } else {
                // Confirm paid→unpaid was already applied optimistically above;
                // for unpaid→paid, apply it now after server confirmed
                if (goingPaid) {
                    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, duesStatus: newStatus } : m));
                    setPotTotal(prev => prev + duesData.buyInAmount);
                }
            }
        } catch {
            if (!goingPaid) {
                setMembers(prev => prev.map(m => m.id === memberId ? { ...m, duesStatus: currentStatus } : m));
                setPotTotal(prev => prev + duesData.buyInAmount);
            }
            setToggleError('Network error — please try again.');
        } finally {
            setTogglingId(null);
        }
    }

    // ── Invite block (commissioner/canInvite only) ───────────────────────────

    const inviteBlock = canInvite ? (
        <InviteLinkButton
            sleeperLeagueId={sleeperLeagueId}
            leagueName={leagueName}
            season={season}
        />
    ) : null;

    // ── Render ───────────────────────────────────────────────────────────────

    const paidCount   = members.filter(m => m.duesStatus === 'paid').length;
    const fullPot     = duesData ? duesData.buyInAmount * duesData.teamCount : 0;

    // ── Setup form (no dues yet, commissioner) ───────────────────────────────

    if (!duesData) {
        if (!isCommissioner) {
            return (
                <div className="space-y-4">
                    <p className="text-gray-500 text-sm text-center py-6">
                        The commissioner has not configured dues for this league yet.
                    </p>
                    {inviteBlock}
                </div>
            );
        }

        if (!showSetup) {
            return (
                <div className="space-y-4">
                    <div className="text-center py-4 space-y-3">
                        <p className="text-gray-500 text-sm">No dues configured for this league yet.</p>
                        <button
                            onClick={() => setShowSetup(true)}
                            className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-xl transition text-sm"
                        >
                            Set Up Dues →
                        </button>
                    </div>
                    {inviteBlock}
                </div>
            );
        }

        // Setup form
        const remaining = potPreview > 0
            ? potPreview - payoutSpots.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
            : null;

        return (
            <form onSubmit={handleSetupSave} className="space-y-5">
                {setupError && (
                    <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm">
                        {setupError}
                    </div>
                )}

                {/* Buy-in + Total Pot */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Buy-In Per Team</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={buyIn}
                                onChange={e => handleBuyInChange(e.target.value)}
                                placeholder="100"
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-7 pr-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Total Pot</label>
                        <div className="bg-gray-800/40 border border-gray-700 rounded-xl px-4 py-3 text-sm min-h-[46px] flex items-center gap-2">
                            {potPreview > 0 ? (
                                <>
                                    <span className="text-[#C8A951] font-bold">${potPreview.toFixed(0)}</span>
                                    <span className="text-gray-600 text-xs">{totalRosters} × ${parseFloat(buyIn || '0').toFixed(0)}</span>
                                </>
                            ) : (
                                <span className="text-gray-600">auto-calculated</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Payout structure */}
                <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-300">Payout Structure</label>
                        {remaining !== null && (
                            <span className={`text-xs font-semibold ${Math.abs(remaining) < 0.01 ? 'text-green-400' : remaining > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {Math.abs(remaining) < 0.01 ? '✓ Balanced' : remaining > 0 ? `$${remaining.toFixed(0)} left` : `$${Math.abs(remaining).toFixed(0)} over`}
                            </span>
                        )}
                    </div>

                    <div className="space-y-2">
                        {payoutSpots.map((spot, i) => (
                            <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                {/* Label */}
                                <input
                                    type="text"
                                    value={spot.label}
                                    onChange={e => updatePayoutSpot(i, 'label', e.target.value)}
                                    placeholder="e.g. 1st Place"
                                    className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                                />
                                {/* Amount */}
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1 sm:flex-none sm:w-32">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none select-none">$</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={spot.amount}
                                            onChange={e => updatePayoutSpot(i, 'amount', e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removePayoutLine(i)}
                                        className="shrink-0 w-10 h-10 flex items-center justify-center text-gray-600 hover:text-red-400 transition rounded-lg hover:bg-red-900/20"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={addPayoutLine}
                        className="text-xs text-[#C8A951]/70 hover:text-[#C8A951] font-medium transition"
                    >
                        + Add payout line
                    </button>
                </div>

                {/* Teams preview */}
                {sleeperMembers.length > 0 && (
                    <div>
                        <p className="text-sm font-medium text-gray-300 mb-2">
                            Teams ({sleeperMembers.length}) — all start as unpaid
                        </p>
                        <div className="grid sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                            {sleeperMembers.map((m, i) => (
                                <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-1.5">
                                    <span className="text-gray-300 text-xs truncate">{m.teamName || m.displayName}</span>
                                    <span className="text-xs text-red-400 ml-2 shrink-0">Unpaid</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-3 pt-1">
                    <button
                        type="submit"
                        disabled={setupSaving}
                        className="flex-1 bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-gray-950 font-bold py-2.5 rounded-xl transition text-sm"
                    >
                        {setupSaving ? 'Saving…' : 'Save Dues Configuration'}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowSetup(false); setSetupError(''); }}
                        className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm transition"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        );
    }

    // ── Dues tracker view ────────────────────────────────────────────────────

    // Identify the current member's own row (matched by userId if linked)
    const myMemberRow = currentUserId
        ? members.find(m => m.userId === currentUserId) ?? null
        : null;

    return (
        <div className="space-y-5">
            {/* Success banner — shown after returning from Stripe */}
            {showPaidBanner && (
                <div className="bg-green-900/30 border border-green-700/60 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-green-400 text-lg">✓</span>
                    <div>
                        <p className="text-green-300 font-semibold text-sm">Payment received!</p>
                        <p className="text-green-500 text-xs">Your dues have been recorded. The commissioner will see your payment.</p>
                    </div>
                    <button onClick={() => setShowPaidBanner(false)} className="ml-auto text-green-600 hover:text-green-400 text-lg leading-none">×</button>
                </div>
            )}

            {/* Cancelled banner */}
            {showCancelledBanner && (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-gray-400 text-sm">Payment cancelled. No charge was made.</span>
                    <button onClick={() => setShowCancelledBanner(false)} className="ml-auto text-gray-600 hover:text-gray-400 text-lg leading-none">×</button>
                </div>
            )}

            {/* My payment status (members only — prominent, at the top) */}
            {!isCommissioner && myMemberRow && (
                <div className={`rounded-xl border px-4 py-3.5 flex items-center justify-between gap-4 ${
                    myMemberRow.duesStatus === 'paid'
                        ? 'bg-green-900/20 border-green-800/50'
                        : 'bg-amber-900/20 border-amber-800/50'
                }`}>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Your Status</p>
                        <p className="font-bold text-base text-white">{myMemberRow.teamName || myMemberRow.displayName}</p>
                    </div>
                    <span className={`text-sm font-bold px-3 py-1.5 rounded-full border ${
                        myMemberRow.duesStatus === 'paid'
                            ? 'bg-green-900/40 text-green-400 border-green-800'
                            : 'bg-amber-900/30 text-amber-400 border-amber-800'
                    }`}>
                        {myMemberRow.duesStatus === 'paid' ? '✓ Paid' : '⚠ Unpaid'}
                    </span>
                </div>
            )}

            {/* Pay Dues button + instructions (unpaid members only) */}
            {!isCommissioner && myMemberRow && myMemberRow.duesStatus !== 'paid' && (
                <div className="space-y-3">
                    <button
                        onClick={handlePayDues}
                        disabled={payingDues}
                        className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-60 disabled:cursor-not-allowed text-gray-950 font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm"
                    >
                        {payingDues ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                </svg>
                                Redirecting to payment…
                            </>
                        ) : (
                            <>💳 Pay Dues — ${duesData.buyInAmount.toFixed(0)}</>
                        )}
                    </button>
                    {payError && <p className="text-red-400 text-xs text-center">{payError}</p>}
                    <p className="text-gray-600 text-xs text-center leading-relaxed">
                        A small card processing fee applies. —{' '}
                        <span className="text-gray-500">or</span>
                        {' '}— Contact your commissioner to pay by cash or Venmo.
                    </p>
                </div>
            )}

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-800/60 rounded-xl p-4">
                    <p className="text-gray-500 text-xs mb-1">Buy-In</p>
                    <p className="text-white font-bold text-lg">${duesData.buyInAmount.toFixed(0)}</p>
                </div>
                <div className="bg-gray-800/60 rounded-xl p-4">
                    <p className="text-gray-500 text-xs mb-1">Cash Collected</p>
                    <p className="text-[#C8A951] font-bold text-lg">${collectedAmount.toFixed(0)}</p>
                    <p className="text-gray-600 text-xs">of ${fullPot.toFixed(0)}</p>
                </div>
                <div className="bg-gray-800/60 rounded-xl p-4">
                    <p className="text-gray-500 text-xs mb-1">Paid</p>
                    <p className="font-bold text-lg">
                        <span className="text-green-400">{paidCount}</span>
                        <span className="text-gray-600 font-normal text-sm"> / {duesData.teamCount}</span>
                    </p>
                </div>
                <div className="bg-gray-800/60 rounded-xl p-4">
                    <p className="text-gray-500 text-xs mb-1">Status</p>
                    <p className="text-white font-semibold text-sm">{DUES_STATUS_LABEL[duesData.status] ?? duesData.status}</p>
                </div>
            </div>

            {/* Progress bar */}
            {fullPot > 0 && (
                <div className="space-y-1">
                    <div className="w-full bg-gray-800 rounded-full h-2 relative">
                        {/* Members paid (gold) */}
                        <div
                            className="bg-[#C8A951] h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (potTotal / fullPot) * 100)}%` }}
                        />
                        {/* Cash collected marker (slightly lighter, behind) */}
                        {collectedAmount > potTotal && (
                            <div
                                className="absolute top-0 left-0 bg-[#C8A951]/30 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, (collectedAmount / fullPot) * 100)}%` }}
                            />
                        )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>Members paid: {paidCount} / {duesData.teamCount}</span>
                        <span>{Math.round((potTotal / fullPot) * 100)}% confirmed</span>
                    </div>
                </div>
            )}

            {/* Add to Pot (commissioner only) */}
            {isCommissioner && (
                <form onSubmit={(e) => { void handleAddToPot(e); }}
                    className="bg-gray-800/40 border border-gray-700/50 rounded-xl px-4 py-3">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                        Record Cash Received
                    </p>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={addAmount}
                                onChange={e => { setAddAmount(e.target.value); setAddError(''); }}
                                placeholder="0"
                                className={`w-full bg-gray-800 border rounded-lg pl-7 pr-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none transition ${
                                    addInputShake
                                        ? 'border-red-500 ring-2 ring-red-500/40'
                                        : 'border-gray-700 focus:border-[#C8A951]/60'
                                }`}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={addSaving || !addAmount.trim()}
                            className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-gray-950 font-bold px-4 py-2 rounded-lg text-sm transition whitespace-nowrap"
                        >
                            {addSaving ? '…' : '+ Add'}
                        </button>
                    </div>
                    {addError && <p className="text-red-400 text-xs mt-1.5">{addError}</p>}
                    <p className="text-gray-600 text-xs mt-1.5">
                        Enter cash or Venmo received. Balance must cover each member before marking them paid.
                    </p>
                </form>
            )}

            {/* Payout structure */}
            {duesData.payoutSpots.length > 0 && (
                <div>
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Payout Structure</p>
                    <div className="space-y-1.5">
                        {duesData.payoutSpots.map((spot, i) => (
                            <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-4 py-2.5">
                                <span className="text-gray-300 text-sm">{spot.label}</span>
                                <span className="text-[#C8A951] font-semibold text-sm">${spot.amount.toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Payment status */}
            {members.length > 0 && (
                <div>
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Payment Status</p>
                    {toggleError && (
                        <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-3 py-2.5 text-red-400 text-xs mb-2">
                            {toggleError}
                        </div>
                    )}
                    <div className="space-y-1.5">
                        {members.map(m => {
                            const isPaid = m.duesStatus === 'paid';
                            const isToggling = togglingId === m.id;
                            return (
                                <div key={m.id} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-4 py-2.5">
                                    <span className="text-gray-300 text-sm truncate">{m.teamName || m.displayName}</span>
                                    {isCommissioner ? (
                                        <div className="flex items-center gap-2">
                                            {isPaid && m.paymentMethod === 'stripe_direct' && (
                                                <span className="text-xs text-blue-400 border border-blue-800 bg-blue-900/20 px-2 py-0.5 rounded-full">Stripe</span>
                                            )}
                                            {isPaid && m.paymentMethod === 'manual' && (
                                                <span className="text-xs text-gray-500 border border-gray-700 bg-gray-800/40 px-2 py-0.5 rounded-full">Cash</span>
                                            )}
                                            <button
                                                onClick={() => toggleMemberStatus(m.id, m.duesStatus)}
                                                disabled={!!togglingId || m.paymentMethod === 'stripe_direct'}
                                                title={m.paymentMethod === 'stripe_direct' ? 'Stripe payment — cannot be reversed here' : undefined}
                                                className={`text-xs font-semibold px-3 py-1 rounded-full border transition disabled:opacity-50 ${
                                                    isPaid
                                                        ? 'bg-green-900/40 text-green-400 border-green-800 hover:bg-green-900/60'
                                                        : 'bg-red-900/30 text-red-400 border-red-900 hover:bg-red-900/50'
                                                } ${m.paymentMethod === 'stripe_direct' ? 'cursor-default' : ''}`}
                                            >
                                                {isToggling ? '…' : isPaid ? '✓ Paid' : 'Unpaid'}
                                            </button>
                                        </div>
                                    ) : (
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                            isPaid
                                                ? 'bg-green-900/40 text-green-400 border-green-800'
                                                : 'bg-red-900/30 text-red-400 border-red-900'
                                        }`}>
                                            {isPaid ? '✓ Paid' : 'Unpaid'}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {isCommissioner && (
                        <p className="text-gray-700 text-xs mt-2">
                            Add cash received above, then click a status to mark as paid.
                        </p>
                    )}
                </div>
            )}

            {/* Invite link (always visible to canInvite) */}
            {canInvite && (
                <div className="border-t border-gray-800 pt-4 space-y-3">
                    {inviteBlock}
                    {isCommissioner && (
                        <a
                            href="/dashboard/commissioner"
                            className="inline-block text-xs font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
                        >
                            Full Commissioner Hub →
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
