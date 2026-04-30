'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface UnassignedLeague {
    id: string;
    leagueName: string;
    totalRosters: number;
    scoringType: string | null;
}

interface Props {
    planId: string;
    planType: 'player' | 'commissioner';
    unassignedLeagues: UnassignedLeague[];
    // When set, this is a *reassign* (replace currentLeagueId) — shows "Change" not "Assign"
    currentLeagueId?: string;
}

function scoringLabel(s: string | null) {
    if (s === 'ppr')      return 'PPR';
    if (s === 'half_ppr') return '0.5 PPR';
    return 'Std';
}

export default function AssignLeagueToPlan({ planId, planType, unassignedLeagues, currentLeagueId }: Props) {
    const router     = useRouter();
    const [open, setOpen]     = useState(false);
    const [picked, setPicked] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const isReassign = !!currentLeagueId;
    const hasChoices = unassignedLeagues.length > 0;

    async function handleAssign() {
        if (!picked) return;
        setSaving(true);
        setError('');
        try {
            // If reassigning, unassign the old league first
            if (currentLeagueId) {
                await fetch(`/api/leagues/${currentLeagueId}/assign`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planId: null, planType: null }),
                });
            }
            const res = await fetch(`/api/leagues/${picked}/assign`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId, planType }),
            });
            if (!res.ok) {
                const d = await res.json() as { error?: string };
                throw new Error(d.error ?? 'Assignment failed');
            }
            setOpen(false);
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={
                    isReassign
                        ? 'text-xs text-gray-400 hover:text-gray-200 transition underline underline-offset-2'
                        : 'text-sm bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-4 py-2 rounded-lg transition'
                }
            >
                {isReassign ? 'Change' : 'Assign League'}
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-800">
                            <h2 className="text-base font-bold">
                                {isReassign ? 'Change Assigned League' : 'Assign a League to This Plan'}
                            </h2>
                            <p className="text-gray-400 text-sm mt-0.5">
                                {isReassign
                                    ? 'Pick a different league to assign here. The current league will become unassigned.'
                                    : 'Choose from your unassigned Sleeper leagues.'}
                            </p>
                        </div>

                        <div className="px-6 py-4 space-y-3">
                            {!hasChoices ? (
                                <p className="text-gray-400 text-sm py-2">
                                    No unassigned leagues available.{' '}
                                    <a href="/dashboard/sync" className="text-[#C8A951] hover:underline">Sync a league</a> first.
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {unassignedLeagues.map(l => (
                                        <button
                                            key={l.id}
                                            type="button"
                                            onClick={() => setPicked(l.id)}
                                            className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                                                picked === l.id
                                                    ? 'border-[#C8A951] bg-[#C8A951]/10'
                                                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                                            }`}
                                        >
                                            <p className="font-medium text-white text-sm">{l.leagueName}</p>
                                            <p className="text-gray-500 text-xs mt-0.5">
                                                {l.totalRosters} teams · {scoringLabel(l.scoringType)}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {error && (
                                <p className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                                    {error}
                                </p>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => { setOpen(false); setPicked(''); setError(''); }}
                                className="text-gray-400 hover:text-gray-200 text-sm font-medium transition px-3 py-2"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleAssign(); }}
                                disabled={saving || !picked}
                                className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold px-5 py-2 rounded-lg transition text-sm"
                            >
                                {saving ? 'Saving…' : isReassign ? 'Change' : 'Assign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
