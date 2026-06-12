'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { StartSitResult, StartSitPlayer, SlotInfo, WinProbImpact } from '@/app/api/leagues/[leagueId]/start-sit/route';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
    playerId:     string;
    fullName:     string;
    position:     string;
    team:         string;
    injuryStatus: string | null;
}

interface Props {
    leagueId:    string;
    week:        number;
    scoringType: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function injuryColor(status: string | null) {
    if (!status || status === 'Active') return '';
    if (status === 'Questionable') return 'text-yellow-400';
    if (status === 'Doubtful')     return 'text-orange-400';
    return 'text-red-400';
}

function matchupColor(label: string) {
    if (label === 'Favorable') return 'text-emerald-400 bg-emerald-900/20 border-emerald-800/60';
    if (label === 'Difficult') return 'text-red-400 bg-red-900/20 border-red-800/60';
    return 'text-gray-400 bg-gray-800/40 border-gray-700/60';
}

function riskColor(label: string) {
    if (label === 'Low')    return 'text-emerald-400 bg-emerald-900/20 border-emerald-800/60';
    if (label === 'High')   return 'text-red-400 bg-red-900/20 border-red-800/60';
    return 'text-yellow-400 bg-yellow-900/20 border-yellow-800/60';
}

function riskDot(label: string) {
    if (label === 'Low')  return 'bg-emerald-400';
    if (label === 'High') return 'bg-red-400';
    return 'bg-yellow-400';
}

function slotChipStyle(type: string) {
    if (type === 'direct') return 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/30';
    if (type === 'flex')   return 'text-sky-400 bg-sky-900/20 border-sky-800/60';
    return 'text-orange-400 bg-orange-900/20 border-orange-800/60';
}

function confLabel(conf: number, winner: StartSitResult['winner']): string {
    if (winner === 'toss-up') return 'Toss-Up';
    const pct = Math.round(conf * 100);
    if (pct >= 85) return 'High confidence';
    if (pct >= 70) return 'Moderate confidence';
    return 'Lean';
}

// ── Player search picker ──────────────────────────────────────────────────────

function PlayerPicker({
    label,
    selected,
    onSelect,
    season,
    week,
}: {
    label:    string;
    selected: SearchResult | null;
    onSelect: (p: SearchResult | null) => void;
    season:   string;
    week:     number;
}) {
    const [query,   setQuery]   = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [open,    setOpen]    = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapRef     = useRef<HTMLDivElement>(null);

    const search = useCallback((q: string) => {
        if (q.length < 2) { setResults([]); setOpen(false); return; }
        fetch(`/api/players/search?q=${encodeURIComponent(q)}&season=${season}&week=${week}`)
            .then(r => r.json())
            .then((data: SearchResult[]) => { setResults(data); setOpen(true); })
            .catch(() => {});
    }, [season, week]);

    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const q = e.target.value;
        setQuery(q);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(q), 250);
    }

    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);

    function pick(p: SearchResult) {
        onSelect(p);
        setQuery(p.fullName);
        setOpen(false);
    }

    function clear() {
        onSelect(null);
        setQuery('');
        setResults([]);
        setOpen(false);
    }

    return (
        <div ref={wrapRef} className="flex-1 min-w-0 space-y-1.5">
            <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label}</p>

            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={onChange}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    placeholder="Search player…"
                    autoComplete="off"
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/60 transition"
                />
                {query && (
                    <button type="button" onClick={clear} aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M3 3l10 10M13 3L3 13" />
                        </svg>
                    </button>
                )}

                {open && results.length > 0 && (
                    <div className="absolute z-30 top-full mt-1 w-full bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                        {results.map(p => (
                            <button key={p.playerId} type="button" onClick={() => pick(p)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-800 transition border-b border-gray-800/60 last:border-0">
                                <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400">
                                    {p.position}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{p.fullName}</p>
                                    <p className="text-[10px] text-gray-500">
                                        {p.team}
                                        {p.injuryStatus && p.injuryStatus !== 'Active' && (
                                            <span className={` · ${injuryColor(p.injuryStatus)}`}>{p.injuryStatus}</span>
                                        )}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selected && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-xl border border-gray-700/50">
                    <div className="shrink-0 w-6 h-6 rounded-md bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-400">
                        {selected.position}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate">{selected.fullName}</p>
                        <p className="text-[10px] text-gray-500">{selected.team}</p>
                    </div>
                    {selected.injuryStatus && selected.injuryStatus !== 'Active' && (
                        <span className={`text-[9px] font-bold shrink-0 ${injuryColor(selected.injuryStatus)}`}>
                            {selected.injuryStatus === 'Questionable' ? 'Q' : selected.injuryStatus === 'Doubtful' ? 'D' : selected.injuryStatus}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Projection bar with risk badge ────────────────────────────────────────────

function ProjBar({ player, isWinner, maxProj }: { player: StartSitPlayer; isWinner: boolean; maxProj: number }) {
    const pct = maxProj > 0 ? Math.min((player.proj / maxProj) * 100, 100) : 0;
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-sm font-semibold truncate max-w-[150px] ${isWinner ? 'text-white' : 'text-gray-400'}`}>
                        {player.name}
                    </span>
                    {/* Risk badge */}
                    <span className={`shrink-0 flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${riskColor(player.riskLabel)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${riskDot(player.riskLabel)}`} />
                        {player.riskLabel}
                    </span>
                </div>
                <span className={`text-sm font-bold tabular-nums shrink-0 ${isWinner ? 'text-[#D4AF37]' : 'text-gray-500'}`}>
                    {player.proj.toFixed(1)}
                </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${isWinner ? 'bg-[#D4AF37]' : 'bg-gray-600'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-600 flex-wrap">
                <span>Base {player.baseProj.toFixed(1)}</span>
                <span>·</span>
                <span className={`font-medium border rounded px-1 py-px ${matchupColor(player.matchup)}`}>{player.matchup}</span>
                {player.injuryStatus && player.injuryStatus !== 'Active' && (
                    <>
                        <span>·</span>
                        <span className={injuryColor(player.injuryStatus)}>{player.injuryStatus}</span>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Slot info chip ────────────────────────────────────────────────────────────

function SlotChip({ slotInfo }: { slotInfo: SlotInfo }) {
    const icon = slotInfo.type === 'direct' ? '⚡' : slotInfo.type === 'flex' ? '↔' : '⚠';
    return (
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${slotChipStyle(slotInfo.type)}`}>
            <span>{icon}</span>
            {slotInfo.label}
        </span>
    );
}

// ── Win probability impact section ────────────────────────────────────────────

function WinProbSection({ impact, playerA, playerB }: { impact: WinProbImpact; playerA: StartSitPlayer; playerB: StartSitPlayer }) {
    const better = impact.impact >= 0 ? playerA : playerB;
    const wpA = Math.round(impact.winProbA * 100);
    const wpB = Math.round(impact.winProbB * 100);
    const diff = Math.abs(Math.round(impact.impact * 100));
    const hasDiff = diff >= 1;

    return (
        <div className="px-6 py-5 border-t border-gray-800 space-y-3">
            <p className="text-[10px] font-bold tracking-widest text-gray-600 uppercase">Win Probability Impact</p>

            {/* Bar comparison */}
            <div className="space-y-2">
                {[{ player: playerA, wp: wpA }, { player: playerB, wp: wpB }].map(({ player, wp }) => (
                    <div key={player.id} className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-400 truncate max-w-[160px]">{player.name}</span>
                            <span className={`font-bold tabular-nums ${wp >= 50 ? 'text-[#D4AF37]' : 'text-gray-500'}`}>{wp}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${wp >= 50 ? 'bg-[#D4AF37]' : 'bg-gray-600'}`}
                                style={{ width: `${wp}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {hasDiff ? (
                <p className="text-xs text-gray-400">
                    Starting <span className="font-semibold text-white">{better.name}</span> gives you a{' '}
                    <span className="text-[#D4AF37] font-bold">+{diff}%</span> higher win probability this week.
                </p>
            ) : (
                <p className="text-xs text-gray-600">Win probability impact is negligible — both choices are nearly equivalent.</p>
            )}
        </div>
    );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: StartSitResult }) {
    const { winner, confidence, delta, playerA, playerB, explanation, slotInfo, winProbImpact } = result;
    const winnerPlayer = winner === 'playerA' ? playerA : winner === 'playerB' ? playerB : null;
    const maxProj = Math.max(playerA.proj, playerB.proj, 1);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

            {/* Winner banner */}
            <div className={`px-6 py-4 flex items-center justify-between gap-4 ${
                winner === 'toss-up' ? 'bg-gray-800/60' : 'bg-[#D4AF37]/10 border-b border-[#D4AF37]/20'
            }`}>
                <div>
                    {winner === 'toss-up' ? (
                        <>
                            <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Toss-Up</p>
                            <p className="text-lg font-bold text-white mt-0.5">Too close to call</p>
                        </>
                    ) : (
                        <>
                            <p className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase">Start</p>
                            <p className="text-lg font-bold text-white mt-0.5">{winnerPlayer?.name}</p>
                        </>
                    )}
                    {/* Slot chip */}
                    <div className="mt-2">
                        <SlotChip slotInfo={slotInfo} />
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">{confLabel(confidence, winner)}</p>
                    <p className="text-2xl font-bold text-[#D4AF37] tabular-nums mt-0.5">
                        {winner === 'toss-up' ? '—' : `+${Math.abs(delta).toFixed(1)}`}
                    </p>
                    {winner !== 'toss-up' && <p className="text-[10px] text-gray-600">pts projected ahead</p>}
                </div>
            </div>

            {/* Projection bars */}
            <div className="px-6 py-5 space-y-4 border-b border-gray-800">
                <ProjBar player={playerA} isWinner={winner === 'playerA'} maxProj={maxProj} />
                <ProjBar player={playerB} isWinner={winner === 'playerB'} maxProj={maxProj} />
            </div>

            {/* Win probability impact */}
            {winProbImpact && (
                <WinProbSection impact={winProbImpact} playerA={playerA} playerB={playerB} />
            )}

            {/* Explanation */}
            <div className="px-6 py-5 space-y-2 border-t border-gray-800">
                <p className="text-[10px] font-bold tracking-widest text-gray-600 uppercase mb-3">Analysis</p>
                {explanation.map((line, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                        <svg className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 8l3.5 3.5L13 4" />
                        </svg>
                        <p className="text-sm text-gray-300 leading-snug">{line}</p>
                    </div>
                ))}
            </div>

            {/* Confidence meter */}
            <div className="px-6 pb-5">
                <div className="bg-gray-800/50 rounded-xl px-4 py-3">
                    <div className="flex justify-between text-[10px] text-gray-600 mb-1.5">
                        <span>Confidence</span>
                        <span className="text-gray-400 font-semibold">{Math.round(confidence * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[#D4AF37] rounded-full transition-all duration-700"
                            style={{ width: `${Math.round(confidence * 100)}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-gray-700 mt-1.5">
                        Based on projection delta, injury status, positional volatility, and matchup difficulty.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function StartSitAdvisor({ leagueId, week, scoringType }: Props) {
    const now    = new Date();
    const season = String(now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1);

    const [playerA, setPlayerA] = useState<SearchResult | null>(null);
    const [playerB, setPlayerB] = useState<SearchResult | null>(null);
    const [result,  setResult]  = useState<StartSitResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    const ready = !!playerA && !!playerB && !loading;

    async function compare() {
        if (!ready) return;
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const res = await fetch(`/api/leagues/${leagueId}/start-sit`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ playerAId: playerA.playerId, playerBId: playerB.playerId, week }),
            });
            if (!res.ok) {
                const d = await res.json() as { error?: string };
                setError(d.error ?? 'Comparison failed.');
                return;
            }
            setResult(await res.json() as StartSitResult);
        } catch {
            setError('Network error — please try again.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { setResult(null); }, [playerA, playerB]);

    const label = scoringType === 'ppr' ? 'PPR' : scoringType === 'half_ppr' ? 'Half PPR' : 'Standard';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Start/Sit Intelligence</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Week {week} · {label} · FantasyiQ projections</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>

                </div>
            </div>

            {/* Player pickers */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400">Choose two players to compare</p>
                <div className="flex gap-4 flex-col sm:flex-row">
                    <PlayerPicker label="Player A" selected={playerA} onSelect={setPlayerA} season={season} week={week} />
                    <div className="shrink-0 flex sm:flex-col items-center justify-center sm:pt-8 gap-2">
                        <div className="hidden sm:block w-px h-4 bg-gray-800" />
                        <span className="text-xs font-bold text-gray-700 tracking-widest">VS</span>
                        <div className="hidden sm:block w-px h-4 bg-gray-800" />
                    </div>
                    <PlayerPicker label="Player B" selected={playerB} onSelect={setPlayerB} season={season} week={week} />
                </div>

                <button
                    type="button"
                    onClick={() => { void compare(); }}
                    disabled={!ready}
                    className="w-full bg-[#D4AF37] hover:bg-[#c9a82e] disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition text-sm"
                >
                    {loading ? 'Analyzing…' : 'Compare'}
                </button>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            {result && <ResultCard result={result} />}

            {!result && !loading && (
                <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-12 text-center">
                    <div className="text-3xl mb-3">🤔</div>
                    <p className="text-gray-400 text-sm font-medium">Select two players above to get a recommendation.</p>
                    <p className="text-gray-600 text-xs mt-1">
                        FantasyiQ compares projections, matchup difficulty, injury risk, volatility, and win probability impact.
                    </p>
                </div>
            )}
        </div>
    );
}
