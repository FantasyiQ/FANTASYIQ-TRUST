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

interface ExistingPayout {
    rank:     number;
    amount:   number;
    teamId:   string;
    teamName: string;
    paidAt:   string | null;
}

interface Props {
    leagueId:        string;
    leagueName:      string;
    potTotal:        number;
    teams:           Team[];
    defaultSpots:    DefaultSpot[];
    existingPayouts: ExistingPayout[] | null;
    seasonComplete:  boolean;
}

interface RowState {
    rank:   number;
    label:  string;
    teamId: string;
    amount: string; // string so input is controlled without auto-coercion
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
}: Props) {
    const router = useRouter();

    const hasExisting = !!existingPayouts && existingPayouts.length > 0;

    // Editing state: start in read-only if payouts already saved
    const [editing, setEditing] = useState(!hasExisting);

    // Build initial row state
    function buildRows(): RowState[] {
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
            teamId: '',
            amount: s.amount > 0 ? String(s.amount) : '',
        }));
    }

    const [rows, setRows]         = useState<RowState[]>(buildRows);
    const [saving, setSaving]     = useState(false);
    const [saveError, setSaveError] = useState('');

    // ── Derived calculations ───────────────────────────────────────────────────

    const totalAssigned = rows.reduce((sum, r) => {
        const n = parseFloat(r.amount);
        return sum + (isNaN(n) ? 0 : n);
    }, 0);

    const matchesPot   = potTotal > 0 && Math.abs(totalAssigned - potTotal) < 0.01;
    const overPot      = potTotal > 0 && totalAssigned > potTotal + 0.01;
    const allTeamsPicked = rows.every(r => r.teamId.trim() !== '');
    const allAmountsValid = rows.every(r => {
        const n = parseFloat(r.amount);
        return !isNaN(n) && n >= 0;
    });
    const canSave = allTeamsPicked && allAmountsValid;

    function updateRow(rank: number, field: 'teamId' | 'amount', val: string) {
        setRows(prev => prev.map(r => r.rank === rank ? { ...r, [field]: val } : r));
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
        const allPaidOut = existingPayouts.every(p => p.paidAt);
        return (
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

                <BackToOverview leagueId={leagueId} />

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-[#CBA135]">Payouts Manager</h1>
                    <p className="text-gray-400 text-sm mt-1">{leagueName}</p>
                </div>

                {/* Status banner */}
                {allPaidOut ? (
                    <div className="bg-[#0F3D2E] border border-emerald-500/60 rounded-xl px-5 py-4 flex items-center gap-3">
                        <span className="text-emerald-400 text-xl">✓</span>
                        <p className="text-emerald-200 font-semibold text-sm">
                            Payouts completed — winners have been paid.
                        </p>
                    </div>
                ) : (
                    <div className="bg-[#3D2F0F] border border-amber-500/60 rounded-xl px-5 py-4 flex items-center gap-3">
                        <span className="text-amber-400 text-xl">⏳</span>
                        <p className="text-amber-200 font-semibold text-sm">
                            Payouts recorded — pending distribution.
                        </p>
                    </div>
                )}

                {/* Payout summary */}
                <div className="bg-[#0A0A0A] border border-[#CBA135] rounded-xl p-5 md:p-7 space-y-4">
                    <h2 className="text-[#CBA135] font-semibold text-base">Recorded Payouts</h2>

                    <div className="space-y-3">
                        {existingPayouts.map(p => (
                            <div
                                key={p.rank}
                                className="flex items-center justify-between bg-black/40 border border-white/5 rounded-lg px-4 py-3"
                            >
                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">{rankLabel(p.rank)}</p>
                                    <p className="text-white font-semibold text-sm">{p.teamName || '—'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[#CBA135] font-bold text-sm">{fmt(p.amount)}</p>
                                    {p.paidAt && (
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Paid {new Date(p.paidAt).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                        <span className="text-gray-400">Total paid out</span>
                        <span className="text-white font-bold">
                            {fmt(existingPayouts.reduce((s, p) => s + p.amount, 0))}
                        </span>
                    </div>
                </div>

                {/* Edit button */}
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="w-full border border-[#CBA135] text-[#CBA135] hover:bg-[#CBA135]/10 font-semibold py-3 rounded-xl transition text-sm"
                >
                    Edit Payouts
                </button>
            </div>
        );
    }

    // ── Editable form ─────────────────────────────────────────────────────────

    return (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

            <BackToOverview leagueId={leagueId} />

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[#CBA135]">Payouts Manager</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Review your final standings and record payouts for this league.
                </p>
                <p className="text-gray-500 text-xs mt-0.5">{leagueName}</p>
            </div>

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
                            {/* Rank label */}
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

                {/* Error */}
                {saveError && (
                    <p className="text-red-400 text-sm">{saveError}</p>
                )}

                {/* Validation hints */}
                {!allTeamsPicked && (
                    <p className="text-gray-500 text-xs">Select a team for each payout spot.</p>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={saving || !canSave}
                    className="w-full bg-[#CBA135] hover:bg-[#E2B857] disabled:opacity-40 disabled:cursor-not-allowed text-gray-950 font-bold py-3 rounded-xl transition text-sm"
                >
                    {saving ? 'Saving…' : 'Save Payouts'}
                </button>

                {/* Cancel edit if editing existing */}
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
