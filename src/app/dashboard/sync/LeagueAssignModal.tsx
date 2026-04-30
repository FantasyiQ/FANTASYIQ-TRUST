'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SyncedLeague {
    id: string;
    leagueName: string;
    totalRosters: number;
    scoringType: string | null;
    assignedPlanId: string | null;
}

interface PlanOption {
    id: string;
    type: 'player' | 'commissioner';
    label: string;
    leagueName?: string | null;
}

interface Props {
    leagues: SyncedLeague[];
    plans: PlanOption[];
    onClose: () => void;
}

function scoringLabel(s: string | null) {
    if (s === 'ppr')      return 'PPR';
    if (s === 'half_ppr') return '0.5 PPR';
    return 'Std';
}

export default function LeagueAssignModal({ leagues, plans, onClose }: Props) {
    const router = useRouter();

    // Map: leagueId → chosen planId (or '' for skip)
    const [assignments, setAssignments] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        for (const l of leagues) {
            init[l.id] = l.assignedPlanId ?? '';
        }
        return init;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const unassigned = leagues.filter(l => !l.assignedPlanId);

    async function handleSave() {
        setSaving(true);
        setError('');
        try {
            const promises = Object.entries(assignments)
                .filter(([, planId]) => planId !== '')
                .map(([leagueId, planId]) => {
                    const plan = plans.find(p => p.id === planId);
                    return fetch(`/api/leagues/${leagueId}/assign`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ planId, planType: plan?.type ?? null }),
                    });
                });
            await Promise.all(promises);
            router.refresh();
            onClose();
        } catch {
            setError('Failed to save assignments — please try again');
        } finally {
            setSaving(false);
        }
    }

    const playerPlans  = plans.filter(p => p.type === 'player');
    const commPlans    = plans.filter(p => p.type === 'commissioner');
    const hasAnyChoice = Object.values(assignments).some(v => v !== '');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-800">
                    <h2 className="text-lg font-bold">Assign Leagues to Plans</h2>
                    <p className="text-gray-400 text-sm mt-0.5">
                        Link each synced league to a plan to unlock features.
                    </p>
                </div>

                {/* League list */}
                <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {unassigned.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">All leagues are already assigned.</p>
                    ) : (
                        unassigned.map(league => (
                            <div key={league.id} className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-white text-sm">{league.leagueName}</p>
                                        <p className="text-gray-500 text-xs">{league.totalRosters} teams · {scoringLabel(league.scoringType)}</p>
                                    </div>
                                    <span className="text-xs font-semibold text-yellow-400 bg-yellow-900/30 border border-yellow-800 px-2 py-0.5 rounded-full shrink-0">
                                        Unassigned
                                    </span>
                                </div>

                                <select
                                    value={assignments[league.id] ?? ''}
                                    onChange={e => setAssignments(prev => ({ ...prev, [league.id]: e.target.value }))}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C8A951] transition"
                                >
                                    <option value="">— Skip for now —</option>
                                    {playerPlans.length > 0 && (
                                        <optgroup label="Player Plans">
                                            {playerPlans.map(p => (
                                                <option key={p.id} value={p.id}>{p.label}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                    {commPlans.length > 0 && (
                                        <optgroup label="Commissioner Plans">
                                            {commPlans.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.label}{p.leagueName ? ` — ${p.leagueName}` : ''}
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>
                        ))
                    )}

                    {error && (
                        <p className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-200 text-sm font-medium transition px-4 py-2"
                    >
                        Skip All
                    </button>
                    <button
                        type="button"
                        onClick={() => { void handleSave(); }}
                        disabled={saving || !hasAnyChoice}
                        className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold px-5 py-2 rounded-lg transition text-sm"
                    >
                        {saving ? 'Saving…' : 'Save Assignments'}
                    </button>
                </div>
            </div>
        </div>
    );
}
