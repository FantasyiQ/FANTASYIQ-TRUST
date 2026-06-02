'use client';

import { useState } from 'react';

interface Member {
    userId: string;
    name:   string | null;
}

interface LockedImport {
    submittedAt:  string; // ISO string
    memberCount:  number;
}

interface Props {
    leagueId:     string;
    members:      Member[];
    lockedImport: LockedImport | null;
}

interface MemberState {
    completedSeasons: number;
    returned:         boolean;
    approved:         boolean;
}

export default function HistoryImportForm({ leagueId, members, lockedImport }: Props) {
    const [form, setForm]       = useState<Record<string, MemberState>>(
        Object.fromEntries(
            members.map(m => [m.userId, { completedSeasons: 0, returned: false, approved: false }])
        )
    );
    const [open,     setOpen]    = useState(false);
    const [loading,  setLoading] = useState(false);
    const [error,    setError]   = useState('');
    const [done,     setDone]    = useState<LockedImport | null>(lockedImport);

    function update(userId: string, field: keyof MemberState, value: number | boolean) {
        setForm(prev => ({ ...prev, [userId]: { ...prev[userId], [field]: value } }));
    }

    async function submit() {
        setLoading(true);
        setError('');
        try {
            const payload = members
                .map(m => ({ userId: m.userId, ...form[m.userId] }))
                .filter(e => e.completedSeasons > 0 || e.returned || e.approved);

            if (payload.length === 0) {
                setError('Add at least one data point before submitting.');
                return;
            }

            const res = await fetch(`/api/lf/leagues/${leagueId}/history-import`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ members: payload }),
            });
            const data = await res.json() as { error?: string; processed?: number };
            if (res.ok) {
                setDone({ submittedAt: new Date().toISOString(), memberCount: data.processed ?? payload.length });
                setOpen(false);
            } else {
                setError(data.error ?? 'Something went wrong.');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    // ── Locked state ──────────────────────────────────────────────────────────
    if (done) {
        return (
            <div className="rounded-xl border border-emerald-800 bg-emerald-900/10 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-sm font-bold">History imported</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/30 border border-emerald-800 text-emerald-400">
                        Locked
                    </span>
                </div>
                <p className="text-xs text-gray-500">
                    {done.memberCount} member{done.memberCount !== 1 ? 's' : ''} processed on{' '}
                    {new Date(done.submittedAt).toLocaleDateString()}.
                    PRS scores have been recalculated. Members were notified.
                </p>
                <p className="text-[10px] text-gray-700 mt-1">
                    History imports are one-time and cannot be edited. Contact support if you need a correction.
                </p>
            </div>
        );
    }

    // ── Collapsed trigger ─────────────────────────────────────────────────────
    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full rounded-xl border border-dashed border-gray-700 px-4 py-3 text-left hover:border-[#D4AF37]/50 transition group"
            >
                <div className="text-sm font-bold text-gray-400 group-hover:text-[#D4AF37] transition">
                    + Import member history
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                    Add verified seasons, retention, and approvals for your members. One-time. Cannot be undone.
                </p>
            </button>
        );
    }

    // ── Open form ─────────────────────────────────────────────────────────────
    return (
        <div className="rounded-xl border border-[#D4AF37]/30 bg-gray-900 p-4 space-y-4">

            {/* Header */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Import Member History</h3>
                    <button
                        onClick={() => setOpen(false)}
                        className="text-xs text-gray-600 hover:text-gray-400 transition"
                    >
                        Cancel
                    </button>
                </div>
                <p className="text-[11px] text-gray-500">
                    This is a one-time action. Once submitted, history is locked and cannot be changed.
                    Each member will receive a notification. Only add history you can vouch for.
                </p>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_80px_72px_80px] gap-3 items-center border-b border-gray-800 pb-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-600">Member</span>
                <span className="text-[10px] uppercase tracking-wider text-gray-600 text-center">Seasons</span>
                <span className="text-[10px] uppercase tracking-wider text-gray-600 text-center">Returned</span>
                <span className="text-[10px] uppercase tracking-wider text-gray-600 text-center">Approve</span>
            </div>

            {/* Member rows */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {members.map(m => {
                    const state = form[m.userId];
                    return (
                        <div key={m.userId} className="grid grid-cols-[1fr_80px_72px_80px] gap-3 items-center">
                            {/* Name */}
                            <span className="text-xs font-semibold text-gray-300 truncate" title={m.name ?? 'Anonymous'}>
                                {m.name ?? 'Anonymous'}
                            </span>

                            {/* Completed seasons */}
                            <input
                                type="number"
                                min={0}
                                max={20}
                                value={state.completedSeasons}
                                onChange={e => update(m.userId, 'completedSeasons', Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)))}
                                className="w-full text-center text-xs rounded-lg border border-gray-700 bg-gray-800 text-white px-2 py-1.5 focus:outline-none focus:border-[#D4AF37]/50"
                            />

                            {/* Returned */}
                            <label className="flex justify-center">
                                <input
                                    type="checkbox"
                                    checked={state.returned}
                                    onChange={e => update(m.userId, 'returned', e.target.checked)}
                                    className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                                />
                            </label>

                            {/* Commish approval */}
                            <label className="flex justify-center">
                                <input
                                    type="checkbox"
                                    checked={state.approved}
                                    onChange={e => update(m.userId, 'approved', e.target.checked)}
                                    className="w-4 h-4 accent-emerald-500 cursor-pointer"
                                />
                            </label>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-600 border-t border-gray-800 pt-2">
                <span><span className="text-gray-400 font-semibold">Seasons:</span> Completed seasons → boosts SeasonScore</span>
                <span><span className="text-gray-400 font-semibold">Returned:</span> Came back next year → boosts RetentionScore</span>
                <span><span className="text-gray-400 font-semibold">Approve:</span> You vouch for them → boosts CommissionerTrust</span>
            </div>

            {error && (
                <p className="text-xs text-red-400 rounded-lg bg-red-950/30 border border-red-900/50 px-3 py-2">
                    {error}
                </p>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={submit}
                    disabled={loading}
                    className="flex-1 py-2 rounded-xl font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
                >
                    {loading ? 'Submitting…' : 'Submit & Lock History'}
                </button>
                <p className="text-[10px] text-gray-700 flex-1">
                    Submitted history cannot be edited. Each member will be notified and their PRS will recalculate immediately.
                </p>
            </div>
        </div>
    );
}
