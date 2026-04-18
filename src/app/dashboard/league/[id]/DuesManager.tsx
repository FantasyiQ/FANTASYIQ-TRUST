'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DuesMemberRow {
    id: string;
    displayName: string;
    teamName?: string | null;
    duesStatus: string;
}

export interface DuesManagerData {
    id: string;
    buyInAmount: number;
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
    canInvite,
    leagueName,
    season,
    sleeperLeagueId,
    totalRosters,
    sleeperMembers,
}: Props) {
    const router = useRouter();

    // ── Live dues state (syncs when server re-renders) ──────────────────────
    const [duesData, setDuesData]   = useState(initialDuesData);
    const [members, setMembers]     = useState<DuesMemberRow[]>(initialDuesData?.members ?? []);
    const [potTotal, setPotTotal]   = useState(initialDuesData?.potTotal ?? 0);

    useEffect(() => {
        setDuesData(initialDuesData);
        setMembers(initialDuesData?.members ?? []);
        setPotTotal(initialDuesData?.potTotal ?? 0);
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
    const [togglingId, setTogglingId] = useState<string | null>(null);

    // ── Invite state ────────────────────────────────────────────────────────
    const [inviteUrl, setInviteUrl]         = useState<string | null>(null);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [copied, setCopied]               = useState(false);

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

    // ── Payment toggle ──────────────────────────────────────────────────────

    async function toggleMemberStatus(memberId: string, currentStatus: string) {
        if (togglingId || !duesData) return;
        const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
        setTogglingId(memberId);

        // Optimistic update
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, duesStatus: newStatus } : m));
        setPotTotal(prev => newStatus === 'paid'
            ? prev + (duesData.buyInAmount)
            : prev - (duesData.buyInAmount)
        );

        try {
            const res = await fetch(`/api/dues/${duesData.id}/member-status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId, status: newStatus }),
            });
            if (!res.ok) {
                // Revert on failure
                setMembers(prev => prev.map(m => m.id === memberId ? { ...m, duesStatus: currentStatus } : m));
                setPotTotal(prev => currentStatus === 'paid'
                    ? prev + (duesData.buyInAmount)
                    : prev - (duesData.buyInAmount)
                );
            }
        } catch {
            setMembers(prev => prev.map(m => m.id === memberId ? { ...m, duesStatus: currentStatus } : m));
        } finally {
            setTogglingId(null);
        }
    }

    // ── Invite link ─────────────────────────────────────────────────────────

    async function generateInvite() {
        setInviteLoading(true);
        try {
            const res = await fetch(`/api/leagues/${sleeperLeagueId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueName, season }),
            });
            const data = await res.json() as { url?: string; error?: string };
            if (res.ok && data.url) setInviteUrl(data.url);
        } catch {
            // silently fail
        } finally {
            setInviteLoading(false);
        }
    }

    async function copyInvite() {
        if (!inviteUrl) return;
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // ── Invite block (commissioner-only, always rendered) ────────────────────

    const inviteBlock = canInvite ? (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-gray-300 text-sm font-medium">Invite Link</p>
                <span className="text-gray-600 text-xs">Commissioner only</span>
            </div>
            <p className="text-gray-500 text-xs">Share with league members so they can sign up and view this league on FantasyIQ Trust.</p>
            {inviteUrl ? (
                <div className="flex items-center gap-2">
                    <input
                        readOnly
                        value={inviteUrl}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-xs font-mono focus:outline-none"
                    />
                    <button
                        onClick={copyInvite}
                        className={`shrink-0 text-xs font-bold px-3 py-2 rounded-lg transition border ${
                            copied
                                ? 'bg-green-900/40 text-green-400 border-green-800'
                                : 'bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 border-[#C8A951]'
                        }`}
                    >
                        {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                </div>
            ) : (
                <button
                    onClick={generateInvite}
                    disabled={inviteLoading}
                    className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-gray-950 font-bold px-4 py-2 rounded-lg text-sm transition"
                >
                    {inviteLoading ? 'Generating…' : 'Get Invite Link'}
                </button>
            )}
        </div>
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

                {/* Buy-in */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Buy-In Per Team</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                            <input
                                type="number" min="1" step="0.01"
                                value={buyIn}
                                onChange={e => handleBuyInChange(e.target.value)}
                                placeholder="100"
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-7 pr-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Total Pot</label>
                        <div className="bg-gray-800/40 border border-gray-700 rounded-xl px-4 py-2.5 text-sm">
                            {potPreview > 0 ? (
                                <span className="text-[#C8A951] font-bold">${potPreview.toFixed(0)}</span>
                            ) : (
                                <span className="text-gray-600">auto-calculated</span>
                            )}
                            {potPreview > 0 && (
                                <span className="text-gray-500 text-xs ml-2">{totalRosters} teams × ${parseFloat(buyIn || '0').toFixed(0)}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Payout spots */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-300">Payout Structure</label>
                        {remaining !== null && (
                            <span className={`text-xs font-semibold ${Math.abs(remaining) < 0.01 ? 'text-green-400' : remaining > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {Math.abs(remaining) < 0.01 ? '✓ Balanced' : remaining > 0 ? `$${remaining.toFixed(0)} unallocated` : `$${Math.abs(remaining).toFixed(0)} over budget`}
                            </span>
                        )}
                    </div>
                    <div className="space-y-2">
                        {payoutSpots.map((spot, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={spot.label}
                                    onChange={e => updatePayoutSpot(i, 'label', e.target.value)}
                                    placeholder="e.g. 1st Place"
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                                />
                                <div className="relative w-28">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                                    <input
                                        type="number" min="0" step="1"
                                        value={spot.amount}
                                        onChange={e => updatePayoutSpot(i, 'amount', e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removePayoutLine(i)}
                                    className="text-gray-700 hover:text-red-400 text-sm transition px-1"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={addPayoutLine}
                            className="text-xs text-[#C8A951]/70 hover:text-[#C8A951] font-medium transition"
                        >
                            + Add payout line
                        </button>
                    </div>
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

    return (
        <div className="space-y-5">
            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-800/60 rounded-xl p-4">
                    <p className="text-gray-500 text-xs mb-1">Buy-In</p>
                    <p className="text-white font-bold text-lg">${duesData.buyInAmount.toFixed(0)}</p>
                </div>
                <div className="bg-gray-800/60 rounded-xl p-4">
                    <p className="text-gray-500 text-xs mb-1">Pot Collected</p>
                    <p className="text-[#C8A951] font-bold text-lg">${potTotal.toFixed(0)}</p>
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
                    <div className="w-full bg-gray-800 rounded-full h-2">
                        <div
                            className="bg-[#C8A951] h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (potTotal / fullPot) * 100)}%` }}
                        />
                    </div>
                    <p className="text-gray-600 text-xs text-right">
                        {Math.round((potTotal / fullPot) * 100)}% collected
                    </p>
                </div>
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
                    <div className="space-y-1.5">
                        {members.map(m => {
                            const isPaid = m.duesStatus === 'paid';
                            const isToggling = togglingId === m.id;
                            return (
                                <div key={m.id} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-4 py-2.5">
                                    <span className="text-gray-300 text-sm truncate">{m.teamName || m.displayName}</span>
                                    {isCommissioner ? (
                                        <button
                                            onClick={() => toggleMemberStatus(m.id, m.duesStatus)}
                                            disabled={!!togglingId}
                                            className={`text-xs font-semibold px-3 py-1 rounded-full border transition disabled:opacity-50 ${
                                                isPaid
                                                    ? 'bg-green-900/40 text-green-400 border-green-800 hover:bg-green-900/60'
                                                    : 'bg-red-900/30 text-red-400 border-red-900 hover:bg-red-900/50'
                                            }`}
                                        >
                                            {isToggling ? '…' : isPaid ? '✓ Paid' : 'Unpaid'}
                                        </button>
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
                        <p className="text-gray-700 text-xs mt-2">Click a status to toggle it.</p>
                    )}
                </div>
            )}

            {/* Commissioner actions */}
            {isCommissioner && (
                <div className="border-t border-gray-800 pt-4 space-y-3">
                    {inviteBlock}
                    <a
                        href="/dashboard/commissioner"
                        className="inline-block text-xs font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
                    >
                        Full Commissioner Hub →
                    </a>
                </div>
            )}
        </div>
    );
}
