'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BackToOverview from '../_components/BackToOverview';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team {
    id:   string;
    name: string;
}

interface DefaultSpot {
    rank:   number;
    label:  string;
    amount: number;
}

interface AutoDetected {
    rank:     number;
    teamId:   string;
    teamName: string;
}

interface ExistingPayout {
    rank:     number;
    amount:   number;
    teamId:   string;
    teamName: string;
    paidAt:   string | null;
}

interface Props {
    leagueId:             string;
    leagueName:           string;
    potTotal:             number;
    teams:                Team[];
    defaultSpots:         DefaultSpot[];
    existingPayouts:      ExistingPayout[] | null;
    seasonComplete:       boolean;
    autoDetectedWinners:  AutoDetected[] | null;
}

interface RowState {
    rank:   number;
    label:  string;
    teamId: string;
    amount: string;
}

const RANK_LABELS = ['1st Place', '2nd Place', '3rd Place', '4th Place', '5th Place'];

function rankLabel(rank: number): string {
    return RANK_LABELS[rank - 1] ?? `Place ${rank}`;
}

function fmt(n: number): string {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PayoutsManagerForm({
    leagueId,
    leagueName,
    potTotal,
    teams,
    defaultSpots,
    existingPayouts,
    seasonComplete,
    autoDetectedWinners,
}: Props) {
    const router = useRouter();

    const hasExisting = !!existingPayouts && existingPayouts.length > 0;

    // Track local paid state for optimistic updates in read-only view
    const [localPaidAt, setLocalPaidAt] = useState<Record<number, string>>(() => {
        const m: Record<number, string> = {};
        existingPayouts?.forEach(p => { if (p.paidAt) m[p.rank] = p.paidAt; });
        return m;
    });
    const [markingRank, setMarkingRank] = useState<number | null>(null);
    const [markError, setMarkError]     = useState('');

    // Editing state: start in read-only if payouts already saved
    const [editing, setEditing] = useState(!hasExisting);

    // Build initial row state — pre-fill from autoDetectedWinners when no existing
    function buildRows(): RowState[] {
        const autoMap = new Map(autoDetectedWinners?.map(a => [a.rank, a]));

        if (hasExisting && existingPayouts) {
            return existingPayouts.map(p => ({
                rank:   p.rank,
                label:  rankLabel(p.rank),
                teamId: p.teamId,
                amount: String(p.amount),
            }));
        }
        return defaultSpots.map(s => ({
            rank:   s.rank,
            label:  s.label,
            teamId: autoMap.get(s.rank)?.teamId ?? '',
            amount: s.amount > 0 ? String(s.amount) : '',
        }));
    }

    const [rows, setRows]           = useState<RowState[]>(buildRows);
    const [saving, setSaving]       = useState(false);
    const [saveError, setSaveError] = useState('');

    // ── Derived calculations ──────────────────────────────────────────────────

    const totalAssigned = rows.reduce((sum, r) => {
        const n = parseFloat(r.amount);
        return sum + (isNaN(n) ? 0 : n);
    }, 0);

    const matchesPot      = potTotal > 0 && Math.abs(totalAssigned - potTotal) < 0.01;
    const overPot         = potTotal > 0 && totalAssigned > potTotal + 0.01;
    const allTeamsPicked  = rows.every(r => r.teamId.trim() !== '');
    const allAmountsValid = rows.every(r => { const n = parseFloat(r.amount); return !isNaN(n) && n >= 0; });
    const canSave         = allTeamsPicked && allAmountsValid;

    const autoFilled = !hasExisting && !!autoDetectedWinners && autoDetectedWinners.length > 0;

    function updateRow(rank: number, field: 'teamId' | 'amount', val: string) {
        setRows(prev => prev.map(r => r.rank === rank ? { ...r, [field]: val } : r));
    }

    // ── Mark as paid ──────────────────────────────────────────────────────────

    async function handleMarkPaid(rank: number) {
        setMarkError('');
        setMarkingRank(rank);
        try {
            const res = await fetch(`/api/leagues/${leagueId}/payouts/mark-paid`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ rank }),
            });
            if (!res.ok) {
                const d = await res.json() as { error?: string };
                setMarkError(d.error ?? 'Failed to mark as paid.');
                return;
            }
            // Optimistic update
            setLocalPaidAt(prev => ({ ...prev, [rank]: new Date().toISOString() }));
        } catch {
            setMarkError('Network error — please try again.');
        } finally {
            setMarkingRank(null);
        }
    }

    // ── Save handler ──────────────────────────────────────────────────────────

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!canSave) return;
        setSaveError('');
        setSaving(true);
        try {
            const teamMap = new Map(teams.map(t => [t.id, t.name]));
            const payload = rows.map(r => ({
                rank:     r.rank,
                amount:   parseFloat(r.amount) || 0,
                teamId:   r.teamId,
                teamName: teamMap.get(r.teamId) ?? r.teamId,
            }));

            const res = await fetch(`/api/leagues/${leagueId}/payouts`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ payouts: payload }),
            });

            if (!res.ok) {
                const d = await res.json() as { error?: string };
                setSaveError(d.error ?? 'Failed to save payouts.');
                return;
            }

            router.push(`/dashboard/league/${leagueId}/overview?payouts_recorded=true`);
        } catch {
            setSaveError('Network error — please try again.');
        } finally {
            setSaving(false);
        }
    }

    // ── Read-only view ────────────────────────────────────────────────────────

    if (hasExisting && !editing && existingPayouts) {
        const allPaidOut = existingPayouts.every(p => localPaidAt[p.rank]);

        return (
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

                <BackToOverview leagueId={leagueId} />

                <div>
                    <h1 className="text-2xl font-bold text-[#CBA135]">Payouts Manager</h1>
                    <p className="text-gray-400 text-sm mt-1">{leagueName}</p>
                </div>

                {/* Status banner */}
                {allPaidOut ? (
                    <div className="bg-[#0F3D2E] border border-emerald-500/60 rounded-xl px-5 py-4 flex items-center gap-3">
                        <span className="text-emerald-400 text-xl">✓</span>
                        <p className="text-emerald-200 font-semibold text-sm">
                            Payouts completed — all winners have been paid.
                        </p>
                    </div>
                ) : (
                    <div className="bg-[#3D2F0F] border border-amber-500/60 rounded-xl px-5 py-4 flex items-center gap-3">
                        <span className="text-amber-400 text-xl">⏳</span>
                        <p className="text-amber-200 font-semibold text-sm">
                            Payouts recorded — mark each winner as paid when distributed.
                        </p>
                    </div>
                )}

                {/* Mark-error */}
                {markError && (
                    <p className="text-red-400 text-sm">{markError}</p>
                )}

                {/* Payout table */}
                <div className="bg-[#0A0A0A] border border-[#CBA135] rounded-xl p-5 md:p-7 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[#CBA135] font-semibold text-base">Recorded Payouts</h2>
                        <a
                            href={`/dashboard/league/${leagueId}/payouts/history`}
                            className="text-xs text-gray-500 hover:text-[#CBA135] transition-colors"
                        >
                            View history →
                        </a>
                    </div>

                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-1 pb-1 border-b border-white/10">
                        <span className="text-xs text-gray-600 uppercase tracking-wider">Team</span>
                        <span className="text-xs text-gray-600 uppercase tracking-wider text-right">Amount</span>
                        <span className="text-xs text-gray-600 uppercase tracking-wider text-right">Status</span>
                    </div>

                    <div className="space-y-2">
                        {existingPayouts.map(p => {
                            const paidAt = localPaidAt[p.rank] ?? p.paidAt;
                            const isPaid = !!paidAt;
                            return (
                                <div
                                    key={p.rank}
                                    className="grid grid-cols-[1fr_auto_auto] gap-3 items-center bg-black/40 border border-white/5 rounded-lg px-4 py-3"
                                >
                                    <div>
                                        <p className="text-xs text-gray-500 mb-0.5">{rankLabel(p.rank)}</p>
                                        <p className="text-white font-semibold text-sm">{p.teamName || '—'}</p>
                                    </div>
                                    <span className="text-[#CBA135] font-bold text-sm text-right">
                                        {fmt(p.amount)}
                                    </span>
                                    <div className="text-right">
                                        {isPaid ? (
                                            <span className="inline-flex items-center gap-1 bg-[#0F3D2E] border border-emerald-500/40 text-emerald-400 text-xs font-semibold px-2 py-1 rounded-full">
                                                ✓ Paid
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={markingRank === p.rank}
                                                onClick={() => { void handleMarkPaid(p.rank); }}
                                                className="text-[#CBA135] hover:text-[#E2B857] text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                                            >
                                                {markingRank === p.rank ? 'Saving…' : 'Mark as paid →'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                        <span className="text-gray-400">Total</span>
                        <span className="text-white font-bold">
                            {fmt(existingPayouts.reduce((s, p) => s + p.amount, 0))}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="w-full border border-[#CBA135] text-[#CBA135] hover:bg-[#CBA135]/10 font-semibold py-3 rounded-xl transition text-sm"
                    >
                        Edit Payouts
                    </button>
                    <a
                        href={`/dashboard/league/${leagueId}/payouts/history`}
                        className="w-full text-center text-gray-500 hover:text-gray-300 text-sm py-2 transition"
                    >
                        View full payout history →
                    </a>
                </div>
            </div>
        );
    }

    // ── Editable form ─────────────────────────────────────────────────────────

    return (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

            <BackToOverview leagueId={leagueId} />

            <div>
                <h1 className="text-2xl font-bold text-[#CBA135]">Payouts Manager</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Review your final standings and record payouts for this league.
                </p>
                <p className="text-gray-500 text-xs mt-0.5">{leagueName}</p>
            </div>

            {/* Auto-detect notice */}
            {autoFilled && (
                <div className="bg-[#CBA135]/10 border border-[#CBA135]/30 rounded-xl px-4 py-3 flex items-center gap-2">
                    <span className="text-[#CBA135]">✦</span>
                    <p className="text-[#CBA135] text-sm">
                        Auto-detected from Sleeper final standings. Review and confirm below.
                    </p>
                </div>
            )}

            {/* Season warning */}
            {!seasonComplete && (
                <div className="bg-[#3D2F0F] border border-amber-500/60 rounded-xl px-4 py-3">
                    <p className="text-amber-200 text-sm">
                        The season may still be in progress. Payouts can be recorded at any time.
                    </p>
                </div>
            )}

            {/* Main form card */}
            <form
                onSubmit={(e) => { void handleSave(e); }}
                className="bg-[#0A0A0A] border border-[#CBA135] hover:border-[#E2B857] rounded-xl p-5 md:p-7 space-y-6 transition-colors"
            >
                {/* Pot total header */}
                {potTotal > 0 && (
                    <div className="flex items-center justify-between bg-black/50 border border-white/5 rounded-lg px-4 py-3">
                        <span className="text-gray-400 text-sm">League pot total</span>
                        <span className="text-white font-bold">{fmt(potTotal)}</span>
                    </div>
                )}

                <div className="space-y-5">
                    {rows.map(row => (
                        <div key={row.rank} className="space-y-2">
                            <p className="text-[#CBA135] font-semibold text-sm">{row.label}</p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Team dropdown */}
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Team *</label>
                                    <select
                                        value={row.teamId}
                                        onChange={e => updateRow(row.rank, 'teamId', e.target.value)}
                                        required
                                        className="w-full bg-black border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#CBA135]/60 appearance-none"
                                    >
                                        <option value="">Select a team…</option>
                                        {teams.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Amount input */}
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Amount ($) *</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={row.amount}
                                            onChange={e => updateRow(row.rank, 'amount', e.target.value)}
                                            placeholder="0"
                                            required
                                            className="w-full bg-black border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#CBA135]/60"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Auto-sum indicator */}
                <div className={`rounded-lg px-4 py-3 flex items-center justify-between text-sm border ${
                    matchesPot
                        ? 'bg-[#0F3D2E] border-emerald-500/60 text-emerald-200'
                        : overPot
                            ? 'bg-red-950/40 border-red-500/60 text-red-300'
                            : 'bg-[#3D2F0F] border-amber-500/60 text-amber-200'
                }`}>
                    <span>Total assigned</span>
                    <span className="font-bold">
                        {fmt(totalAssigned)}
                        {potTotal > 0 && (
                            <span className="ml-2 font-normal text-xs opacity-70">
                                {matchesPot
                                    ? '✓ matches pot'
                                    : overPot
                                        ? `over by ${fmt(totalAssigned - potTotal)}`
                                        : `${fmt(potTotal - totalAssigned)} remaining`}
                            </span>
                        )}
                    </span>
                </div>

                {saveError && <p className="text-red-400 text-sm">{saveError}</p>}

                {!allTeamsPicked && (
                    <p className="text-gray-500 text-xs">Select a team for each payout spot.</p>
                )}

                <button
                    type="submit"
                    disabled={saving || !canSave}
                    className="w-full bg-[#CBA135] hover:bg-[#E2B857] disabled:opacity-40 disabled:cursor-not-allowed text-gray-950 font-bold py-3 rounded-xl transition text-sm"
                >
                    {saving ? 'Saving…' : 'Save Payouts'}
                </button>

                {hasExisting && (
                    <button
                        type="button"
                        onClick={() => { setEditing(false); setRows(buildRows()); setSaveError(''); }}
                        className="w-full text-gray-500 hover:text-gray-300 text-sm py-1 transition"
                    >
                        Cancel
                    </button>
                )}
            </form>
        </div>
    );
}
