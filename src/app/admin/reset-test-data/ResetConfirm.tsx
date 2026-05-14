'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ResetConfirm() {
    const router  = useRouter();
    const [busy, setBusy]     = useState(false);
    const [error, setError]   = useState('');
    const [confirm, setConfirm] = useState('');

    const PHRASE = 'RESET';
    const ready  = confirm === PHRASE && !busy;

    async function handleReset() {
        if (!ready) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/admin/reset-test-data', { method: 'POST' });
            if (!res.ok) {
                const d = await res.json() as { error?: string };
                setError(d.error ?? 'Reset failed — check server logs.');
                return;
            }
            router.push('/dashboard?test_data_reset=true');
        } catch {
            setError('Network error — please try again.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="w-full max-w-md space-y-6">

            {/* Header */}
            <div className="text-center space-y-2">
                <p className="text-5xl">⚠️</p>
                <h1 className="text-2xl font-bold text-white">Reset Test Data</h1>
                <p className="text-gray-400 text-sm">
                    Developer-only. This will permanently wipe all league-related data
                    for your account so you can test the full onboarding flow from scratch.
                </p>
            </div>

            {/* What gets deleted */}
            <div className="bg-red-950/30 border border-red-800/50 rounded-xl px-5 py-4 space-y-3">
                <p className="text-red-400 font-semibold text-sm uppercase tracking-wider">Will be deleted</p>
                <ul className="space-y-1 text-sm text-red-300/80">
                    {[
                        'All synced League records',
                        'All LeagueDues trackers',
                        'All DuesMember rows (including as a member)',
                        'All Payouts & Winners',
                        'All Announcements, Polls, Proposals',
                        'All Payout History & Documents',
                        'All Connected Leagues & Invites',
                        'All Power Ranking Snapshots',
                        'All Calendar Events',
                    ].map(item => (
                        <li key={item} className="flex items-start gap-2">
                            <span className="text-red-500 shrink-0 mt-0.5">✕</span>
                            {item}
                        </li>
                    ))}
                </ul>
            </div>

            {/* What stays */}
            <div className="bg-[#0F3D2E] border border-emerald-800/40 rounded-xl px-5 py-4 space-y-2">
                <p className="text-emerald-400 font-semibold text-sm uppercase tracking-wider">Will NOT be deleted</p>
                <ul className="space-y-1 text-sm text-emerald-300/80">
                    {['Your user account', 'Auth sessions', 'Subscription records', 'Player data & rankings'].map(item => (
                        <li key={item} className="flex items-center gap-2">
                            <span className="text-emerald-500 shrink-0">✓</span>
                            {item}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Confirmation input */}
            <div className="space-y-2">
                <label className="block text-sm text-gray-400">
                    Type <span className="font-bold text-white">RESET</span> to confirm
                </label>
                <input
                    type="text"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value.toUpperCase())}
                    placeholder="RESET"
                    autoComplete="off"
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder-gray-700"
                />
            </div>

            {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            {/* Reset button */}
            <button
                type="button"
                onClick={() => { void handleReset(); }}
                disabled={!ready}
                className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition text-sm"
            >
                {busy ? 'Resetting…' : 'Reset My Test Data'}
            </button>

            <p className="text-center text-gray-600 text-xs">
                This action cannot be undone. Only your account data is affected.
            </p>
        </div>
    );
}
