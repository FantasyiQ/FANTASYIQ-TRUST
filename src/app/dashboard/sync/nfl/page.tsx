'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NFLLeagueLookupResult {
    leagueId:     string;
    name:         string;
    season:       string;
    numTeams:     number;
    scoringType:  string;
    status:       string;
    alreadySynced: boolean;
}

type Step      = 'connect' | 'select' | 'syncing' | 'done';
type ConnectTab = 'login' | 'manual';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        in_season: 'bg-emerald-900/30 border-emerald-500/40 text-emerald-400',
        pre_draft: 'bg-gray-800 border-gray-700 text-gray-400',
        drafting:  'bg-blue-900/30 border-blue-500/40 text-blue-400',
        complete:  'bg-gray-800 border-gray-700 text-gray-500',
    };
    const labels: Record<string, string> = {
        in_season: 'In Season',
        pre_draft: 'Pre-Draft',
        drafting:  'Drafting',
        complete:  'Complete',
    };
    return (
        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border ${map[status] ?? 'bg-gray-800 border-gray-700 text-gray-400'}`}>
            {labels[status] ?? status}
        </span>
    );
}

// ── League card ───────────────────────────────────────────────────────────────

function LeagueCard({ league, selected, onToggle }: {
    league:   NFLLeagueLookupResult;
    selected: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={league.alreadySynced}
            className={`w-full text-left rounded-xl border p-4 transition-all ${
                league.alreadySynced
                    ? 'border-gray-800 opacity-50 cursor-not-allowed'
                    : selected
                        ? 'border-[#D4AF37]/60 bg-[#D4AF37]/8'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-900'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white text-sm truncate">{league.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                        {league.numTeams} teams · Season {league.season} · {league.scoringType.toUpperCase()}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {league.alreadySynced ? (
                        <span className="text-[10px] text-[#D4AF37] font-bold">Synced</span>
                    ) : (
                        <>
                            <StatusBadge status={league.status} />
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                selected ? 'bg-[#D4AF37] border-[#D4AF37]' : 'border-gray-600'
                            }`}>
                                {selected && (
                                    <svg className="w-2.5 h-2.5 text-black" viewBox="0 0 12 12" fill="currentColor">
                                        <path d="M10.28 2.28L4.5 8.06 1.72 5.28 0.56 6.44 4.5 10.38 11.44 3.44z" />
                                    </svg>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </button>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NFLSyncPage() {
    const router = useRouter();

    const [step,       setStep]      = useState<Step>('connect');
    const [tab,        setTab]       = useState<ConnectTab>('login');
    const [email,      setEmail]     = useState('');
    const [password,   setPassword]  = useState('');
    const [manualSid,  setManualSid] = useState('');
    const [leagues,    setLeagues]   = useState<NFLLeagueLookupResult[]>([]);
    const [selected,   setSelected]  = useState<Set<string>>(new Set());
    const [loading,    setLoading]   = useState(false);
    const [error,      setError]     = useState('');
    const [syncedIds,  setSyncedIds] = useState<string[]>([]);

    async function connect() {
        setLoading(true);
        setError('');
        try {
            const body = tab === 'manual'
                ? { sid: manualSid.trim() }
                : { email: email.trim(), password };

            const res  = await fetch('/api/nfl/connect', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const data = await res.json() as { ok?: boolean; error?: string };
            if (!res.ok) throw new Error(data.error ?? 'Connection failed');

            await loadLeagues();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Connection failed');
            setLoading(false);
        }
    }

    async function loadLeagues() {
        setLoading(true);
        setError('');
        try {
            const res  = await fetch('/api/nfl/lookup');
            const data = await res.json() as { leagues?: NFLLeagueLookupResult[]; error?: string };
            if (!res.ok) throw new Error(data.error ?? 'Failed to load leagues');
            setLeagues(data.leagues ?? []);
            setStep('select');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load leagues');
        } finally {
            setLoading(false);
        }
    }

    function toggleLeague(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function syncLeagues() {
        if (selected.size === 0) return;
        setStep('syncing');
        setError('');
        try {
            const res  = await fetch('/api/nfl/sync', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueIds: [...selected] }),
            });
            const data = await res.json() as {
                synced?:   number;
                leagues?:  { id: string }[];
                error?:    string;
            };
            if (!res.ok) throw new Error(data.error ?? 'Sync failed');
            setSyncedIds(data.leagues?.map(l => l.id) ?? []);
            setStep('done');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sync failed');
            setStep('select');
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-20 px-4">
            <div className="max-w-xl mx-auto space-y-8">

                {/* Header */}
                <div>
                    <Link href="/dashboard" className="text-gray-600 text-xs hover:text-gray-400 transition mb-4 block">
                        ← Dashboard
                    </Link>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
                            <span className="text-[10px] font-black text-blue-400">NFL</span>
                        </div>
                        <h1 className="text-2xl font-extrabold">Connect NFL Fantasy</h1>
                    </div>
                    <p className="text-gray-500 text-sm">
                        Sync your NFL.com fantasy leagues to unlock PRS, DTV, and commissioner tools.
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* ── Step: Connect ──────────────────────────────────────────── */}
                {step === 'connect' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">

                        {/* Tab switcher */}
                        <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
                            {(['login', 'manual'] as ConnectTab[]).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTab(t)}
                                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${
                                        tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-300'
                                    }`}
                                >
                                    {t === 'login' ? 'NFL.com Login' : 'Paste Session Cookie'}
                                </button>
                            ))}
                        </div>

                        {tab === 'login' ? (
                            <div className="space-y-3">
                                <p className="text-xs text-gray-500">
                                    Enter your NFL.com credentials. FiQ uses them only to fetch your fantasy leagues.
                                </p>
                                <input
                                    type="email"
                                    placeholder="NFL.com email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/60"
                                />
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !loading && connect()}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/60"
                                />
                                <button
                                    type="button"
                                    onClick={connect}
                                    disabled={loading || !email || !password}
                                    className="w-full py-3 rounded-xl bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold transition"
                                >
                                    {loading ? 'Connecting…' : 'Connect NFL.com'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-gray-500">
                                    Open NFL.com in your browser, open DevTools → Application → Cookies, and copy the value of the <code className="bg-gray-800 px-1 py-0.5 rounded text-[#D4AF37]">sid</code> cookie.
                                </p>
                                <textarea
                                    placeholder="Paste sid cookie value here…"
                                    value={manualSid}
                                    onChange={e => setManualSid(e.target.value)}
                                    rows={3}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/60 resize-none font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={connect}
                                    disabled={loading || !manualSid.trim()}
                                    className="w-full py-3 rounded-xl bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold transition"
                                >
                                    {loading ? 'Connecting…' : 'Connect with Cookie'}
                                </button>
                            </div>
                        )}

                        <p className="text-gray-700 text-[11px] text-center">
                            FiQ only requests read access to your NFL fantasy leagues.
                        </p>
                    </div>
                )}

                {/* ── Step: Select leagues ───────────────────────────────────── */}
                {step === 'select' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-gray-400 text-sm">
                                {loading
                                    ? 'Loading your leagues…'
                                    : `${leagues.length} league${leagues.length !== 1 ? 's' : ''} found`}
                            </p>
                            {selected.size > 0 && (
                                <span className="text-[#D4AF37] text-xs font-semibold">
                                    {selected.size} selected
                                </span>
                            )}
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-6 h-6 border-2 border-gray-700 border-t-[#D4AF37] rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {leagues.map(league => (
                                    <LeagueCard
                                        key={league.leagueId}
                                        league={league}
                                        selected={selected.has(league.leagueId)}
                                        onToggle={() => toggleLeague(league.leagueId)}
                                    />
                                ))}
                            </div>
                        )}

                        {!loading && leagues.length > 0 && (
                            <button
                                type="button"
                                onClick={syncLeagues}
                                disabled={selected.size === 0}
                                className="w-full py-3 rounded-xl bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold transition"
                            >
                                Sync {selected.size > 0
                                    ? `${selected.size} League${selected.size !== 1 ? 's' : ''}`
                                    : 'Selected Leagues'}
                            </button>
                        )}

                        {!loading && leagues.length === 0 && (
                            <div className="text-center py-10 text-gray-600 text-sm">
                                No NFL.com fantasy leagues found for this account.
                            </div>
                        )}
                    </div>
                )}

                {/* ── Step: Syncing ──────────────────────────────────────────── */}
                {step === 'syncing' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center gap-4">
                        <div className="w-8 h-8 border-2 border-gray-700 border-t-[#D4AF37] rounded-full animate-spin" />
                        <p className="text-gray-400 text-sm">Syncing your NFL.com leagues…</p>
                    </div>
                )}

                {/* ── Step: Done ─────────────────────────────────────────────── */}
                {step === 'done' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-5">
                        <div className="w-12 h-12 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mx-auto text-2xl">
                            ✓
                        </div>
                        <div>
                            <p className="font-bold text-white">
                                {syncedIds.length} League{syncedIds.length !== 1 ? 's' : ''} Synced
                            </p>
                            <p className="text-gray-500 text-sm mt-1">
                                Your NFL.com leagues are now live on FiQ. Rosters and values update hourly.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            {syncedIds.length === 1 && (
                                <button
                                    type="button"
                                    onClick={() => router.push(`/dashboard/league/${syncedIds[0]}`)}
                                    className="w-full py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#BF9D2F] text-black text-sm font-bold transition"
                                >
                                    View League
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => router.push('/dashboard')}
                                className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold transition"
                            >
                                Go to Dashboard
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}
