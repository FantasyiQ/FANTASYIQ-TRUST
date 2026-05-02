'use client';

import { useState } from 'react';
import BackToOverview from '../_components/BackToOverview';

interface PayoutSpot {
    label:     string;
    amount:    number;
    sortOrder: number;
}

interface WinnerRow {
    rank:        number;
    teamName:    string;
    displayName: string | null;
    amount:      number;
    paidOut:     boolean;
    paidAt:      string | null;
}

interface Props {
    duesId:          string;
    leagueId:        string;
    payoutSpots:     PayoutSpot[];
    existingWinners: WinnerRow[];
    leagueName:      string;
}

export default function PayoutsManager({
    duesId,
    leagueId,
    payoutSpots,
    existingWinners,
    leagueName,
}: Props) {
    const sorted = [...payoutSpots].sort((a, b) => a.sortOrder - b.sortOrder);

    // Initialise form fields from existing winners (keyed by rank = index+1)
    const winnerByRank = new Map(existingWinners.map(w => [w.rank, w]));

    const [teamNames, setTeamNames]     = useState<string[]>(
        sorted.map((_, i) => winnerByRank.get(i + 1)?.teamName ?? '')
    );
    const [displayNames, setDisplayNames] = useState<string[]>(
        sorted.map((_, i) => winnerByRank.get(i + 1)?.displayName ?? '')
    );

    const [saving, setSaving]       = useState(false);
    const [saveError, setSaveError] = useState('');
    const [savedOk, setSavedOk]     = useState(false);

    const [marking, setMarking]       = useState(false);
    const [markError, setMarkError]   = useState('');
    const [allPaidOut, setAllPaidOut] = useState(
        existingWinners.length > 0 && existingWinners.every(w => w.paidOut)
    );

    const allHaveWinners = teamNames.every(t => t.trim().length > 0);

    function updateTeamName(i: number, val: string) {
        setTeamNames(prev => prev.map((v, idx) => idx === i ? val : v));
    }

    function updateDisplayName(i: number, val: string) {
        setDisplayNames(prev => prev.map((v, idx) => idx === i ? val : v));
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaveError('');
        setSavedOk(false);
        setSaving(true);
        try {
            const winners = sorted.map((spot, i) => ({
                rank:        i + 1,
                teamName:    teamNames[i]?.trim() ?? '',
                displayName: displayNames[i]?.trim() || undefined,
                amount:      spot.amount,
            })).filter(w => w.teamName.length > 0);

            if (winners.length === 0) {
                setSaveError('Enter at least one winner.');
                return;
            }

            const res = await fetch(`/api/dues/${duesId}/winners`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ winners }),
            });
            if (!res.ok) {
                const d = await res.json() as { error?: string };
                setSaveError(d.error ?? 'Failed to save winners.');
                return;
            }
            setSavedOk(true);
        } catch {
            setSaveError('Network error — please try again.');
        } finally {
            setSaving(false);
        }
    }

    async function handleMarkComplete() {
        setMarkError('');
        setMarking(true);
        try {
            const res = await fetch(`/api/dues/${duesId}/winners`, { method: 'PATCH' });
            if (!res.ok) {
                const d = await res.json() as { error?: string };
                setMarkError(d.error ?? 'Failed to mark payouts complete.');
                return;
            }
            setAllPaidOut(true);
        } catch {
            setMarkError('Network error — please try again.');
        } finally {
            setMarking(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

                {/* Breadcrumb */}
                <BackToOverview leagueId={leagueId} />

                {/* Title */}
                <div>
                    <h1 className="text-2xl font-bold text-white">Record Payouts</h1>
                    <p className="text-gray-400 text-sm mt-1">{leagueName}</p>
                </div>

                {/* Completion banner */}
                {allPaidOut && (
                    <div className="bg-green-900/20 border border-green-700/50 rounded-2xl px-5 py-4 flex items-center gap-3">
                        <span className="text-green-400 text-xl">✓</span>
                        <p className="text-green-400 font-semibold text-sm">All payouts marked complete.</p>
                    </div>
                )}

                {/* Winners form */}
                <form onSubmit={(e) => { void handleSave(e); }}
                    className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">

                    <h2 className="font-semibold text-white text-base">Payout Spots</h2>
                    <p className="text-gray-400 text-sm -mt-3">
                        Enter the team name and optional owner name for each winner. Amounts are set in your dues configuration.
                    </p>

                    {sorted.length === 0 && (
                        <p className="text-gray-500 text-sm">No payout spots configured. Set them up in your dues manager first.</p>
                    )}

                    {sorted.map((spot, i) => (
                        <div key={i} className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[#C8A951] font-semibold text-sm">{spot.label}</span>
                                <span className="text-white font-bold text-sm">${spot.amount.toFixed(0)}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Team Name *</label>
                                    <input
                                        type="text"
                                        value={teamNames[i] ?? ''}
                                        onChange={e => updateTeamName(i, e.target.value)}
                                        placeholder="e.g. Dynasty Destroyers"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Owner Name (optional)</label>
                                    <input
                                        type="text"
                                        value={displayNames[i] ?? ''}
                                        onChange={e => updateDisplayName(i, e.target.value)}
                                        placeholder="e.g. John Smith"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C8A951]/60"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    {saveError && (
                        <p className="text-red-400 text-sm">{saveError}</p>
                    )}
                    {savedOk && !saveError && (
                        <p className="text-green-400 text-sm">Winners saved successfully.</p>
                    )}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-gray-950 font-bold py-3 rounded-xl transition text-sm"
                    >
                        {saving ? 'Saving…' : 'Save Winners'}
                    </button>
                </form>

                {/* Mark complete */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    <div>
                        <h2 className="font-semibold text-white text-base">Mark All Payouts Complete</h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Once you have distributed winnings to all winners, mark payouts as complete. This updates the league status and notifies members.
                        </p>
                    </div>

                    {markError && (
                        <p className="text-red-400 text-sm">{markError}</p>
                    )}

                    <button
                        type="button"
                        onClick={() => { void handleMarkComplete(); }}
                        disabled={marking || !allHaveWinners || allPaidOut}
                        className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-40 disabled:cursor-not-allowed text-gray-950 font-bold py-3 rounded-xl transition text-sm"
                    >
                        {marking ? 'Marking…' : allPaidOut ? '✓ Payouts Marked Complete' : 'Mark All Payouts Complete'}
                    </button>

                    {!allHaveWinners && !allPaidOut && (
                        <p className="text-gray-600 text-xs">Save all winners first before marking payouts complete.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
