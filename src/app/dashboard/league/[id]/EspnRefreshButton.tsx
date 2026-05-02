'use client';

import { useState } from 'react';

type Phase = 'idle' | 'form' | 'saving' | 'done';

export default function EspnRefreshButton({ leagueDbId }: { leagueDbId: string }) {
    const [phase, setPhase]   = useState<Phase>('idle');
    const [espnS2, setEspnS2] = useState('');
    const [swid, setSwid]     = useState('');
    const [error, setError]   = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setPhase('saving');
        try {
            const res = await fetch('/api/espn/credentials', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueDbId, espnS2, swid }),
            });
            const data = await res.json() as { error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to update credentials');
                setPhase('form');
                return;
            }
            setPhase('done');
            setTimeout(() => window.location.reload(), 1200);
        } catch {
            setError('Network error — please try again');
            setPhase('form');
        }
    }

    if (phase === 'idle') {
        return (
            <button
                onClick={() => setPhase('form')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-yellow-500 text-xs font-semibold transition"
            >
                🔑 Update ESPN Credentials
            </button>
        );
    }

    if (phase === 'done') {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-900/30 text-green-400 text-xs font-semibold border border-green-800">
                ✓ Credentials updated — reloading…
            </span>
        );
    }

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg w-80">
            <p className="font-semibold text-white text-sm mb-1">Update ESPN Credentials</p>
            <p className="text-gray-400 text-xs mb-3">
                Paste fresh cookies from browser DevTools → Application → Cookies → fantasy.espn.com
            </p>
            <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">SWID</label>
                    <input
                        type="text"
                        value={swid}
                        onChange={(e) => setSwid(e.target.value)}
                        placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                        required
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition font-mono text-xs"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">espn_s2</label>
                    <textarea
                        value={espnS2}
                        onChange={(e) => setEspnS2(e.target.value)}
                        placeholder="AECZHkZa..."
                        required
                        rows={2}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition font-mono text-xs resize-none"
                    />
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => { setPhase('idle'); setError(''); }}
                        className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition">
                        Cancel
                    </button>
                    <button type="submit" disabled={phase === 'saving' || !espnS2.trim() || !swid.trim()}
                        className="px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-gray-900 text-xs font-bold transition">
                        {phase === 'saving' ? 'Saving…' : 'Save & Sync'}
                    </button>
                </div>
            </form>
        </div>
    );
}
