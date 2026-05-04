'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Step = 'credentials' | 'confirm' | 'syncing' | 'done';
type CredentialStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'expired';

interface LookupResult {
    leagueId: string;
    season: number;
    name: string;
    size: number;
    scoringType: string;
    status: string;
    teamCount: number;
}

interface SyncSummary {
    teams: number;
    matchups: number;
    week: number;
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

    const [step, setStep]                     = useState<Step>('credentials');
    const [leagueId, setLeagueId]             = useState('');
    const [espnS2, setEspnS2]                 = useState('');
    const [swid, setSwid]                     = useState('');
    const [credStatus, setCredStatus]         = useState<CredentialStatus>('idle');
    const [loading, setLoading]               = useState(false);
    const [error, setError]                   = useState('');
    const [result, setResult]                 = useState<LookupResult | null>(null);
    const [syncSummary, setSyncSummary]       = useState<SyncSummary | null>(null);
    const [syncProgress, setSyncProgress]     = useState('');

    // Strip whitespace from credentials before using them
    const cleanS2   = espnS2.replace(/\s/g, '');
    const cleanSwid = swid.replace(/\s/g, '');
    const canLookup = leagueId.trim() && cleanS2 && cleanSwid;

    async function handleValidate() {
        if (!canLookup) return;
        setCredStatus('checking');
        setError('');
        try {
            const res = await fetch('/api/espn/validate', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueId: leagueId.trim(), espnS2: cleanS2, swid: cleanSwid }),
            });
            const data = await res.json() as { status: string };
            if (data.status === 'valid')   setCredStatus('valid');
            else if (data.status === 'expired') setCredStatus('expired');
            else setCredStatus('invalid');
        } catch {
            setCredStatus('invalid');
        }
    }

    async function handleLookup(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/espn/lookup', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueId: leagueId.trim(), espnS2: cleanS2, swid: cleanSwid }),
            });
            const data = await res.json() as LookupResult & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to find league'); return; }
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
        setStep('syncing');

        const steps = [
            'Connecting to ESPN…',
            'Fetching league settings…',
            'Fetching teams & rosters…',
            'Fetching matchups…',
            'Saving to database…',
        ];

        // Animate progress messages while the real request runs
        let i = 0;
        setSyncProgress(steps[0]!);
        const interval = setInterval(() => {
            i = Math.min(i + 1, steps.length - 1);
            setSyncProgress(steps[i]!);
        }, 1200);

        try {
            const res = await fetch('/api/espn/sync', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueId: leagueId.trim(), espnS2: cleanS2, swid: cleanSwid }),
            });
            clearInterval(interval);
            const data = await res.json() as { redirectTo?: string; summary?: SyncSummary; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Sync failed');
                setStep('confirm');
                return;
            }
            setSyncSummary(data.summary ?? null);
            setStep('done');
            if (data.redirectTo) {
                setTimeout(() => router.replace(data.redirectTo!), 1500);
            }
        } catch {
            clearInterval(interval);
            setError('Network error — please try again');
            setStep('confirm');
        }
    }

    const stepIndex = { credentials: 0, confirm: 1, syncing: 2, done: 2 }[step];

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
                    {(['credentials', 'confirm', 'done'] as const).map((s, i) => (
                        <span key={s} className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                                i === stepIndex
                                    ? 'border-[#C8A951] bg-[#C8A951]/20 text-[#C8A951]'
                                    : i < stepIndex
                                        ? 'border-green-700 bg-green-900/30 text-green-400'
                                        : 'border-gray-700 text-gray-600'
                            }`}>
                                {i < stepIndex ? '✓' : i + 1}
                            </span>
                            <span className={i === stepIndex ? 'text-white' : 'text-gray-500'}>
                                {s === 'credentials' ? 'Credentials' : s === 'confirm' ? 'Confirm' : 'Done'}
                            </span>
                            {i < 2 && <span className="text-gray-700 mx-1">›</span>}
                        </span>
                    ))}
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">
                        {error}
                        {error.includes('credentials') || error.includes('expired') ? (
                            <p className="text-red-500 text-xs mt-1">Open an Incognito window → log into ESPN → copy fresh cookies from DevTools Network tab.</p>
                        ) : null}
                    </div>
                )}

                {/* ── Step 1: Credentials ───────────────────────────────────── */}
                {step === 'credentials' && (
                    <div className="space-y-4">
                        {/* How-to instructions */}
                        <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4 space-y-3">
                            <p className="text-blue-300 font-semibold text-sm">How to get your ESPN cookies</p>
                            <ol className="space-y-2 text-xs text-blue-400">
                                <li className="flex gap-2">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center font-bold">1</span>
                                    Open an <strong className="text-blue-200">Incognito window</strong> and go to <span className="font-mono bg-blue-900/40 px-1 rounded">fantasy.espn.com</span>. Log in via Disney SSO.
                                </li>
                                <li className="flex gap-2">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center font-bold">2</span>
                                    Open <strong className="text-blue-200">DevTools</strong> (<span className="font-mono bg-blue-900/40 px-1 rounded">Cmd+Option+I</span>) → go to the <strong className="text-blue-200">Network</strong> tab.
                                </li>
                                <li className="flex gap-2">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center font-bold">3</span>
                                    Navigate to your league page. In the Network tab, filter by <span className="font-mono bg-blue-900/40 px-1 rounded">ffl</span> and click any request.
                                </li>
                                <li className="flex gap-2">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center font-bold">4</span>
                                    Go to <strong className="text-blue-200">Headers → Request Headers → Cookie</strong>. Copy the <span className="font-mono bg-blue-900/40 px-1 rounded">espn_s2</span> and <span className="font-mono bg-blue-900/40 px-1 rounded">SWID</span> values.
                                </li>
                            </ol>
                        </div>

                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
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
                                        onChange={(e) => { setSwid(e.target.value); setCredStatus('idle'); }}
                                        placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                                        required
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951] transition font-mono text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">espn_s2 Cookie</label>
                                    <textarea
                                        value={espnS2}
                                        onChange={(e) => { setEspnS2(e.target.value); setCredStatus('idle'); }}
                                        placeholder="AECZHkZa..."
                                        required
                                        rows={3}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951] transition font-mono text-xs resize-none"
                                    />
                                    <p className="text-gray-600 text-xs mt-1">Spaces and line breaks are stripped automatically.</p>
                                </div>

                                {/* Inline credential validator */}
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { void handleValidate(); }}
                                        disabled={!canLookup || credStatus === 'checking'}
                                        className="px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 text-gray-300 text-sm font-medium transition"
                                    >
                                        {credStatus === 'checking' ? 'Checking…' : 'Test Credentials'}
                                    </button>
                                    {credStatus === 'valid' && (
                                        <span className="text-green-400 text-sm font-semibold">✓ Credentials valid</span>
                                    )}
                                    {credStatus === 'expired' && (
                                        <span className="text-yellow-400 text-sm">⚠ Cookies expired — get fresh ones</span>
                                    )}
                                    {credStatus === 'invalid' && (
                                        <span className="text-red-400 text-sm">✕ Invalid — check all three fields</span>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !canLookup}
                                    className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition"
                                >
                                    {loading ? 'Finding league…' : 'Find League'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ── Step 2: Confirm ────────────────────────────────────────── */}
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
                            <div className="pt-3 border-t border-gray-800 text-xs text-gray-500 space-y-0.5">
                                <p>League ID: <span className="font-mono text-gray-400">{result.leagueId}</span></p>
                                <p>Will sync: settings · standings · rosters · matchups</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button type="button" onClick={() => setStep('credentials')}
                                className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-5 py-2.5 rounded-lg transition text-sm">
                                Back
                            </button>
                            <button type="button" onClick={() => { void handleSync(); }}
                                className="flex-1 bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold py-2.5 rounded-lg transition text-sm">
                                Sync {result.name}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Syncing (progress) ─────────────────────────────── */}
                {step === 'syncing' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-4">
                        <div className="flex justify-center">
                            <div className="w-10 h-10 border-4 border-[#C8A951]/30 border-t-[#C8A951] rounded-full animate-spin" />
                        </div>
                        <p className="text-white font-semibold">{syncProgress}</p>
                        <p className="text-gray-500 text-sm">Fetching your full league — this takes a few seconds.</p>
                    </div>
                )}

                {/* ── Step 4: Done ───────────────────────────────────────────── */}
                {step === 'done' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-4">
                        <div className="text-4xl">✅</div>
                        <h2 className="text-xl font-bold">League synced!</h2>
                        {syncSummary && (
                            <p className="text-gray-400 text-sm">
                                {syncSummary.teams} teams · {syncSummary.matchups} week {syncSummary.week} matchups
                            </p>
                        )}
                        <p className="text-gray-500 text-sm">Redirecting to your league…</p>
                    </div>
                )}
            </div>
        </main>
    );
}
