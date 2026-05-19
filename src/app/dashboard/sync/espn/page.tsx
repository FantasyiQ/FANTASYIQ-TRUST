'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ── Extension types (mirrors the extension's types.ts) ────────────────────────

type CookieResponse  = { ok: true;  espn_s2: string; swid: string };
type ErrorResponse   = { ok: false; error: string };
type ExtensionResult = CookieResponse | ErrorResponse;

// Minimal Chrome runtime type — avoids requiring @types/chrome in the Next.js project
interface ChromeRuntime {
    lastError?:  { message?: string } | null;
    sendMessage: (
        extensionId: string,
        message:     unknown,
        callback:    (response: ExtensionResult | undefined) => void,
    ) => void;
}
interface ChromeWindow { runtime: ChromeRuntime }
function getChromeRuntime(): ChromeRuntime | null {
    const cr = (window as unknown as { chrome?: ChromeWindow }).chrome;
    return cr?.runtime ?? null;
}

// The extension ID is set in your Vercel env as NEXT_PUBLIC_ESPN_EXTENSION_ID.
// During local dev, load the extension unpacked in Chrome and paste its ID here.
const EXTENSION_ID = process.env.NEXT_PUBLIC_ESPN_EXTENSION_ID ?? '';

type ExtensionState =
    | 'checking'        // probing for extension on mount
    | 'not_installed'   // extension not detected
    | 'detected'        // extension found, ready to connect
    | 'connecting'      // waiting for cookie read + save
    | 'connected'       // credentials saved, proceed to league ID
    | 'missing_cookies' // extension found but ESPN cookies absent
    | 'error';          // unexpected failure

// ── Step types ────────────────────────────────────────────────────────────────

type Step = 'credentials' | 'confirm' | 'syncing' | 'done';
type CredentialStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'expired';

interface LookupResult {
    leagueId:    string;
    season:      number;
    name:        string;
    size:        number;
    scoringType: string;
    status:      string;
    teamCount:   number;
}

interface SyncSummary {
    teams:    number;
    matchups: number;
    week:     number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoringLabel(type: string) {
    if (type === 'ppr')      return 'PPR';
    if (type === 'half_ppr') return '0.5 PPR';
    return 'Standard';
}

function statusLabel(status: string) {
    switch (status) {
        case 'in_season': return 'In Season';
        case 'pre_draft': return 'Pre-Draft';
        case 'complete':  return 'Complete';
        default:          return status;
    }
}

function statusBadge(status: string) {
    switch (status) {
        case 'in_season': return 'bg-green-900/40 text-green-400 border-green-800';
        case 'pre_draft': return 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
        default:          return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

// ── Extension section ─────────────────────────────────────────────────────────

function ExtensionConnector({
    onCredentials,
}: {
    onCredentials: (s2: string, swid: string) => void;
}) {
    const [extState, setExtState] = useState<ExtensionState>('checking');

    // Probe for the extension on mount
    useEffect(() => {
        if (!EXTENSION_ID) {
            setExtState('not_installed');
            return;
        }

        const cr = getChromeRuntime();
        if (!cr) {
            setExtState('not_installed');
            return;
        }

        cr.sendMessage(
            EXTENSION_ID,
            { type: 'FIQ_PING' },
            (response) => {
                if (cr.lastError || !response) {
                    setExtState('not_installed');
                } else {
                    setExtState('detected');
                }
            },
        );
    }, []);

    async function handleConnect() {
        setExtState('connecting');

        const cr = getChromeRuntime();
        if (!cr || !EXTENSION_ID) {
            setExtState('not_installed');
            return;
        }

        cr.sendMessage(
            EXTENSION_ID,
            { type: 'FIQ_REQUEST_ESPN_COOKIES' },
            async (response) => {
                if (cr.lastError || !response) {
                    setExtState('error');
                    return;
                }
                if (!response.ok) {
                    setExtState(response.error === 'missing_cookies' ? 'missing_cookies' : 'error');
                    return;
                }

                // Save credentials via FiQ API (uses the page's own session)
                try {
                    const res = await fetch('/api/espn/connect', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({ espn_s2: response.espn_s2, swid: response.swid }),
                    });
                    if (!res.ok) { setExtState('error'); return; }
                    setExtState('connected');
                    onCredentials(response.espn_s2, response.swid);
                } catch {
                    setExtState('error');
                }
            },
        );
    }

    if (extState === 'checking') {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin shrink-0" />
                <p className="text-gray-400 text-sm">Checking for FiQ ESPN Connector…</p>
            </div>
        );
    }

    if (extState === 'not_installed') {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🧩</span>
                    <div>
                        <p className="font-semibold text-white text-sm">FiQ ESPN Connector not detected</p>
                        <p className="text-gray-500 text-xs mt-0.5">Install the free extension to connect ESPN in one click.</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start gap-2 pt-1">
                    {EXTENSION_ID ? (
                        <a
                            href={`https://chrome.google.com/webstore/detail/${EXTENSION_ID}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-4 py-2 rounded-lg transition text-sm"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                            </svg>
                            Add to Chrome — it's free
                        </a>
                    ) : (
                        <span className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 text-gray-400 font-semibold px-4 py-2 rounded-lg text-sm cursor-not-allowed">
                            Chrome Web Store — coming soon
                        </span>
                    )}
                    <p className="text-gray-600 text-xs self-center">After installing, refresh this page.</p>
                </div>
                <p className="text-gray-700 text-[10px]">The extension reads only your ESPN cookies (espn_s2 + SWID) and nothing else.</p>
            </div>
        );
    }

    if (extState === 'detected') {
        return (
            <div className="bg-gray-900 border border-[#D4AF37]/30 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center shrink-0">
                        <span className="text-[#D4AF37] text-sm">✓</span>
                    </div>
                    <div>
                        <p className="font-semibold text-white text-sm">FiQ ESPN Connector detected</p>
                        <p className="text-gray-500 text-xs mt-0.5">Make sure you're logged into ESPN, then click Connect.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => { void handleConnect(); }}
                    className="w-full bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold py-2.5 rounded-lg transition text-sm"
                >
                    Connect ESPN Automatically
                </button>
            </div>
        );
    }

    if (extState === 'connecting') {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin shrink-0" />
                <p className="text-gray-400 text-sm">Reading ESPN cookies…</p>
            </div>
        );
    }

    if (extState === 'connected') {
        return (
            <div className="bg-green-900/20 border border-green-700/50 rounded-2xl p-5 flex items-center gap-3">
                <span className="text-green-400 text-xl shrink-0">✓</span>
                <div>
                    <p className="font-semibold text-green-400 text-sm">ESPN credentials connected</p>
                    <p className="text-gray-400 text-xs mt-0.5">Enter your ESPN League ID below to continue.</p>
                </div>
            </div>
        );
    }

    if (extState === 'missing_cookies') {
        return (
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-2xl p-5 space-y-2">
                <p className="font-semibold text-yellow-400 text-sm">ESPN login not found</p>
                <p className="text-gray-400 text-xs">
                    The extension couldn't find your ESPN cookies. Make sure you're logged into
                    {' '}<a href="https://fantasy.espn.com" target="_blank" rel="noreferrer" className="text-[#D4AF37] hover:underline">ESPN Fantasy</a>
                    {' '}in this browser, then click Retry.
                </p>
                <button
                    type="button"
                    onClick={() => { setExtState('detected'); }}
                    className="text-sm text-[#D4AF37] hover:underline"
                >
                    Retry →
                </button>
            </div>
        );
    }

    // error state
    return (
        <div className="bg-red-900/20 border border-red-700/50 rounded-2xl p-5 space-y-2">
            <p className="font-semibold text-red-400 text-sm">Connection failed</p>
            <p className="text-gray-400 text-xs">Something went wrong. Try again or use manual entry below.</p>
            <button
                type="button"
                onClick={() => { setExtState('detected'); }}
                className="text-sm text-[#D4AF37] hover:underline"
            >
                Retry →
            </button>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EspnSyncPage() {
    const router = useRouter();

    const [step, setStep]                 = useState<Step>('credentials');
    const [leagueId, setLeagueId]         = useState('');
    const [espnS2, setEspnS2]             = useState('');
    const [swid, setSwid]                 = useState('');
    const [credStatus, setCredStatus]     = useState<CredentialStatus>('idle');
    const [loading, setLoading]           = useState(false);
    const [error, setError]               = useState('');
    const [result, setResult]             = useState<LookupResult | null>(null);
    const [syncSummary, setSyncSummary]   = useState<SyncSummary | null>(null);
    const [syncProgress, setSyncProgress] = useState('');
    const [showManual, setShowManual]     = useState(false);

    const cleanS2   = espnS2.replace(/\s/g, '');
    const cleanSwid = swid.replace(/\s/g, '');
    const canLookup = leagueId.trim() && cleanS2 && cleanSwid;

    // When the extension supplies credentials, pre-fill the hidden fields
    function handleExtensionCredentials(s2: string, swidVal: string) {
        setEspnS2(s2);
        setSwid(swidVal);
        setCredStatus('valid');
    }

    async function handleValidate() {
        if (!canLookup) return;
        setCredStatus('checking');
        setError('');
        try {
            const res  = await fetch('/api/espn/validate', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueId: leagueId.trim(), espnS2: cleanS2, swid: cleanSwid }),
            });
            const data = await res.json() as { status: string };
            if (data.status === 'valid')        setCredStatus('valid');
            else if (data.status === 'expired') setCredStatus('expired');
            else                                setCredStatus('invalid');
        } catch {
            setCredStatus('invalid');
        }
    }

    async function handleLookup(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res  = await fetch('/api/espn/lookup', {
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

        let i = 0;
        setSyncProgress(steps[0]!);
        const interval = setInterval(() => {
            i = Math.min(i + 1, steps.length - 1);
            setSyncProgress(steps[i]!);
        }, 1200);

        try {
            const res  = await fetch('/api/espn/sync', {
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
                                    ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]'
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
                        {(error.includes('credentials') || error.includes('expired')) && (
                            <p className="text-red-500 text-xs mt-1">Log into ESPN → open DevTools → copy fresh cookies, or use the FiQ Extension above.</p>
                        )}
                    </div>
                )}

                {/* ── Step 1: Credentials ───────────────────────────────────── */}
                {step === 'credentials' && (
                    <div className="space-y-4">

                        {/* Extension connector (primary) */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[#D4AF37] text-xs font-bold uppercase tracking-widest">Recommended</span>
                                <div className="flex-1 h-px bg-gray-800" />
                            </div>
                            <ExtensionConnector onCredentials={handleExtensionCredentials} />
                        </div>

                        {/* League ID — always visible once we have credentials */}
                        {(credStatus === 'valid' || showManual) && (
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
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37] transition font-mono text-sm"
                                        />
                                        <p className="text-gray-600 text-xs mt-1">Found in your ESPN league URL: <span className="font-mono">?leagueId=XXXXXX</span></p>
                                    </div>

                                    {showManual && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-1.5">SWID</label>
                                                <input
                                                    type="text"
                                                    value={swid}
                                                    onChange={(e) => { setSwid(e.target.value); setCredStatus('idle'); }}
                                                    placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                                                    required
                                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37] transition font-mono text-sm"
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
                                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37] transition font-mono text-xs resize-none"
                                                />
                                                <p className="text-gray-600 text-xs mt-1">Spaces and line breaks are stripped automatically.</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleValidate(); }}
                                                    disabled={!canLookup || credStatus === 'checking'}
                                                    className="px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 text-gray-300 text-sm font-medium transition"
                                                >
                                                    {credStatus === 'checking' ? 'Checking…' : 'Test Credentials'}
                                                </button>
                                                {credStatus === 'valid'   && <span className="text-green-400 text-sm font-semibold">✓ Valid</span>}
                                                {credStatus === 'expired' && <span className="text-yellow-400 text-sm">⚠ Expired — get fresh cookies</span>}
                                                {credStatus === 'invalid' && <span className="text-red-400 text-sm">✕ Invalid</span>}
                                            </div>
                                        </>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading || !canLookup}
                                        className="w-full bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition"
                                    >
                                        {loading ? 'Finding league…' : 'Find League'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* Manual fallback toggle */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-xs font-bold uppercase tracking-widest">Manual entry</span>
                                <div className="flex-1 h-px bg-gray-800" />
                            </div>
                            {!showManual ? (
                                <button
                                    type="button"
                                    onClick={() => setShowManual(true)}
                                    className="text-sm text-gray-500 hover:text-gray-300 transition"
                                >
                                    Enter credentials manually instead →
                                </button>
                            ) : (
                                <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4 space-y-3">
                                    <p className="text-blue-300 font-semibold text-sm">How to get your ESPN cookies</p>
                                    <ol className="space-y-2 text-xs text-blue-400">
                                        <li className="flex gap-2">
                                            <span className="shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center font-bold">1</span>
                                            Open <strong className="text-blue-200">Chrome DevTools</strong> (<span className="font-mono bg-blue-900/40 px-1 rounded">Cmd+Option+I</span> / <span className="font-mono bg-blue-900/40 px-1 rounded">F12</span>) while logged into <span className="font-mono bg-blue-900/40 px-1 rounded">fantasy.espn.com</span>.
                                        </li>
                                        <li className="flex gap-2">
                                            <span className="shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center font-bold">2</span>
                                            Go to <strong className="text-blue-200">Application → Cookies → fantasy.espn.com</strong>.
                                        </li>
                                        <li className="flex gap-2">
                                            <span className="shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center font-bold">3</span>
                                            Find <span className="font-mono bg-blue-900/40 px-1 rounded">espn_s2</span> and <span className="font-mono bg-blue-900/40 px-1 rounded">SWID</span> and copy their values.
                                        </li>
                                    </ol>
                                </div>
                            )}
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
                                className="flex-1 bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold py-2.5 rounded-lg transition text-sm">
                                Sync {result.name}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Syncing ────────────────────────────────────────── */}
                {step === 'syncing' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-4">
                        <div className="flex justify-center">
                            <div className="w-10 h-10 border-4 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
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
