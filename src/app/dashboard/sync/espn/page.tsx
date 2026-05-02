'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Step = 'credentials' | 'confirm' | 'done';

interface LookupResult {
    leagueId: string;
    season: number;
    name: string;
    size: number;
    scoringType: string;
    status: string;
    teamCount: number;
}

function scoringLabel(type: string) {
    if (type === 'ppr')      return 'PPR';
    if (type === 'half_ppr') return '0.5 PPR';
    return 'Standard';
}

function statusLabel(status: string) {
    switch (status) {
        case 'in_season':  return 'In Season';
        case 'pre_draft':  return 'Pre-Draft';
        case 'complete':   return 'Complete';
        default:           return status;
    }
}

function statusBadge(status: string) {
    switch (status) {
        case 'in_season':  return 'bg-green-900/40 text-green-400 border-green-800';
        case 'pre_draft':  return 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
        default:           return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

export default function EspnSyncPage() {
    const router = useRouter();

    const [step, setStep]         = useState<Step>('credentials');
    const [leagueId, setLeagueId] = useState('');
    const [espnS2, setEspnS2]     = useState('');
    const [swid, setSwid]         = useState('');
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');
    const [result, setResult]     = useState<LookupResult | null>(null);

    async function handleLookup(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/espn/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId, espnS2, swid }),
            });
            const data = await res.json() as LookupResult & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to look up league'); return; }
            setResult(data);
            setStep('confirm');
        } catch {
            setError('Network error — please try again');
        } finally {
            setLoading(false);
        }
    }

    async function handleSync() {
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/espn/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId, espnS2, swid }),
            });
            const data = await res.json() as { redirectTo?: string; error?: string };
            if (!res.ok) { setError(data.error ?? 'Sync failed'); return; }
            if (data.redirectTo) {
                router.replace(data.redirectTo);
                return;
            }
            setStep('done');
        } catch {
            setError('Network error — please try again');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto space-y-6">

                <div>
                    <Link href="/dashboard/sync" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Sync ESPN League</h1>
                    <p className="text-gray-400 text-sm mt-1">Connect your ESPN Fantasy Football league to FantasyiQ Trust.</p>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 text-sm">
                    {(['credentials', 'confirm', 'done'] as Step[]).map((s, i) => (
                        <span key={s} className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                                step === s ? 'border-[#C8A951] bg-[#C8A951]/20 text-[#C8A951]'
                                : (step === 'confirm' && s === 'credentials') || step === 'done'
                                    ? 'border-green-700 bg-green-900/30 text-green-400'
                                    : 'border-gray-700 text-gray-600'
                            }`}>
                                {((step === 'confirm' && s === 'credentials') || step === 'done') ? '✓' : i + 1}
                            </span>
                            <span className={step === s ? 'text-white' : 'text-gray-500'}>
                                {s === 'credentials' ? 'Credentials' : s === 'confirm' ? 'Confirm' : 'Done'}
                            </span>
                            {i < 2 && <span className="text-gray-700 mx-1">›</span>}
                        </span>
                    ))}
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
                )}

                {/* Step 1: Credentials */}
                {step === 'credentials' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
                        <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl px-4 py-3 text-sm text-blue-300 space-y-1">
                            <p className="font-semibold">How to find your ESPN credentials</p>
                            <ol className="list-decimal list-inside space-y-1 text-blue-400 text-xs mt-1">
                                <li>Open Chrome and log into <span className="font-mono">fantasy.espn.com</span></li>
                                <li>Open DevTools → Application → Cookies → <span className="font-mono">fantasy.espn.com</span></li>
                                <li>Copy <span className="font-mono">espn_s2</span> and <span className="font-mono">SWID</span> values</li>
                            </ol>
                        </div>

                        <form onSubmit={(e) => { void handleLookup(e); }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">League ID</label>
                                <input
                                    type="text"
                                    value={leagueId}
                                    onChange={(e) => setLeagueId(e.target.value)}
                                    placeholder="e.g. 350564"
                                    required
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951] transition font-mono text-sm"
                                />
                                <p className="text-gray-600 text-xs mt-1">Found in your ESPN league URL: <span className="font-mono">?leagueId=XXXXXX</span></p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">SWID</label>
                                <input
                                    type="text"
                                    value={swid}
                                    onChange={(e) => setSwid(e.target.value)}
                                    placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                                    required
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951] transition font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">espn_s2 Cookie</label>
                                <textarea
                                    value={espnS2}
                                    onChange={(e) => setEspnS2(e.target.value)}
                                    placeholder="AECZHkZa..."
                                    required
                                    rows={3}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951] transition font-mono text-xs resize-none"
                                />
                                <p className="text-gray-600 text-xs mt-1">These expire periodically — you may need to refresh them each season.</p>
                            </div>

                            <button type="submit" disabled={loading || !leagueId.trim() || !espnS2.trim() || !swid.trim()}
                                className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition">
                                {loading ? 'Looking up league…' : 'Find League'}
                            </button>
                        </form>
                    </div>
                )}

                {/* Step 2: Confirm */}
                {step === 'confirm' && result && (
                    <div className="space-y-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-bold text-lg text-white">{result.name}</p>
                                    <p className="text-gray-400 text-sm mt-0.5">
                                        {result.season} · {result.teamCount} teams · {scoringLabel(result.scoringType)}
                                    </p>
                                </div>
                                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(result.status)}`}>
                                    {statusLabel(result.status)}
                                </span>
                            </div>
                            <div className="pt-3 border-t border-gray-800">
                                <p className="text-gray-500 text-xs">League ID: <span className="font-mono text-gray-400">{result.leagueId}</span></p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button type="button" onClick={() => setStep('credentials')}
                                className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-5 py-2.5 rounded-lg transition text-sm">
                                Back
                            </button>
                            <button type="button" onClick={() => { void handleSync(); }} disabled={loading}
                                className="flex-1 bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition text-sm">
                                {loading ? 'Syncing…' : `Sync ${result.name}`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Done */}
                {step === 'done' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-4">
                        <div className="text-4xl">✅</div>
                        <h2 className="text-xl font-bold">League synced!</h2>
                        <p className="text-gray-400 text-sm">Standings will refresh hourly.</p>
                        <Link href="/dashboard"
                            className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-6 py-2.5 rounded-lg transition text-sm">
                            Go to Dashboard
                        </Link>
                    </div>
                )}
            </div>
        </main>
    );
}
