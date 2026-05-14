'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface SleeperPlayer {
    playerId:      string;
    fullName:      string;
    position:      string;
    team:          string;
    injuryStatus:  string | null;
    projections:   { pointsPpr: number; pointsStd: number; pointsHalfPpr: number }[];
}

interface LineupEntry {
    slot:     string;
    playerId: string;
    player:   SleeperPlayer | null;
}

interface LineupBuilderProps {
    contestId:   string;
    slots:       string[];           // ordered DFS slot list e.g. ["QB","RB","RB","WR","WR","TE","FLEX","K","DEF"]
    season:      string;
    week:        number;
    scoringType: string | null;
    // Pre-fill from existing lineup (JSON array)
    initialEntries?: { slot: string; playerId: string }[];
    onSaved?: () => void;
}

// Positions accepted per slot
const FLEX_POSITIONS: Record<string, string> = {
    FLEX:       'RB,WR,TE',
    SUPER_FLEX: 'QB,RB,WR,TE',
    REC_FLEX:   'WR,TE',
    WRRB_FLEX:  'RB,WR',
};

function slotPositionFilter(slot: string): string {
    return FLEX_POSITIONS[slot] ?? slot;
}

function projPoints(player: SleeperPlayer, scoringType: string | null): number {
    const p = player.projections[0];
    if (!p) return 0;
    if (scoringType === 'std')      return p.pointsStd;
    if (scoringType === 'half_ppr') return p.pointsHalfPpr;
    return p.pointsPpr;
}

export default function LineupBuilder({
    contestId, slots, season, week, scoringType, initialEntries, onSaved,
}: LineupBuilderProps) {
    // Build initial state
    const buildInitial = useCallback((): LineupEntry[] => {
        return slots.map((slot, i) => {
            const pre = initialEntries?.[i];
            return {
                slot,
                playerId: pre?.playerId ?? '',
                player:   null,
            };
        });
    }, [slots, initialEntries]);

    const [entries,      setEntries]      = useState<LineupEntry[]>(buildInitial);
    const [activeSlot,   setActiveSlot]   = useState<number | null>(null);
    const [query,        setQuery]        = useState('');
    const [results,      setResults]      = useState<SleeperPlayer[]>([]);
    const [searching,    setSearching]    = useState(false);
    const [saving,       setSaving]       = useState(false);
    const [saveError,    setSaveError]    = useState('');
    const [saved,        setSaved]        = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Re-init when initialEntries loads after first render (server data race)
    useEffect(() => {
        if (initialEntries && initialEntries.length > 0) {
            setEntries(buildInitial());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialEntries]);

    // Fetch player names for pre-filled slots
    useEffect(() => {
        const missing = entries
            .filter(e => e.playerId && !e.player)
            .map(e => e.playerId);
        if (missing.length === 0) return;

        // Fetch each player by ID (search by ID is closest we have)
        Promise.all(missing.map(id =>
            fetch(`/api/players/search?q=${id}&season=${season}&week=${week}`)
                .then(r => r.json() as Promise<SleeperPlayer[]>)
                .then(arr => arr.find(p => p.playerId === id) ?? null)
        )).then(players => {
            setEntries(prev => prev.map(e => {
                const found = players.find(p => p?.playerId === e.playerId);
                return found ? { ...e, player: found } : e;
            }));
        }).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function search(q: string) {
        setQuery(q);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (q.length < 2) { setResults([]); return; }

        debounceRef.current = setTimeout(async () => {
            if (activeSlot === null) return;
            const slot = entries[activeSlot].slot;
            const pos  = slotPositionFilter(slot);
            // For flex slots, don't filter by position (send no position param)
            const isFlex = pos.includes(',');
            const url = `/api/players/search?q=${encodeURIComponent(q)}&season=${season}&week=${week}${isFlex ? '' : `&position=${pos}`}`;
            setSearching(true);
            try {
                const data = await fetch(url).then(r => r.json() as Promise<SleeperPlayer[]>);
                // For flex slots, filter client-side
                const eligible = isFlex
                    ? data.filter(p => pos.split(',').includes(p.position))
                    : data;
                setResults(eligible);
            } finally {
                setSearching(false);
            }
        }, 280);
    }

    function selectPlayer(player: SleeperPlayer) {
        if (activeSlot === null) return;
        setEntries(prev => prev.map((e, i) =>
            i === activeSlot ? { ...e, playerId: player.playerId, player } : e
        ));
        setActiveSlot(null);
        setQuery('');
        setResults([]);
    }

    function clearSlot(i: number) {
        setEntries(prev => prev.map((e, j) =>
            j === i ? { ...e, playerId: '', player: null } : e
        ));
    }

    async function submit() {
        setSaving(true);
        setSaveError('');
        setSaved(false);
        try {
            const payload = entries.map(e => ({ slot: e.slot, playerId: e.playerId }));
            const res = await fetch('/api/dfs/lineups', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ contestId, entries: payload }),
            });
            if (res.ok) {
                setSaved(true);
                onSaved?.();
            } else {
                const d = await res.json() as { error?: string };
                setSaveError(d.error ?? 'Failed to save lineup');
            }
        } catch {
            setSaveError('Network error');
        } finally {
            setSaving(false);
        }
    }

    const allFilled  = entries.every(e => e.playerId !== '');
    const totalProj  = entries.reduce((sum, e) => sum + (e.player ? projPoints(e.player, scoringType) : 0), 0);

    // Deduplicate selected players so user can't start same player twice
    const selectedIds = new Set(entries.map(e => e.playerId).filter(Boolean));

    return (
        <div className="space-y-4">
            {/* Slot table */}
            <div className="space-y-1.5">
                {entries.map((entry, i) => {
                    const isActive = activeSlot === i;
                    const pts = entry.player ? projPoints(entry.player, scoringType) : null;

                    return (
                        <div key={i}>
                            <div
                                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition cursor-pointer ${
                                    isActive
                                        ? 'border-[#D4AF37] bg-[#D4AF37]/5'
                                        : entry.player
                                            ? 'border-gray-700 bg-gray-900 hover:border-gray-600'
                                            : 'border-dashed border-gray-700 bg-gray-900/50 hover:border-gray-500'
                                }`}
                                onClick={() => {
                                    if (isActive) { setActiveSlot(null); setQuery(''); setResults([]); }
                                    else { setActiveSlot(i); setQuery(''); setResults([]); }
                                }}
                            >
                                {/* Slot label */}
                                <span className="text-[10px] font-bold text-gray-500 uppercase w-14 shrink-0">
                                    {entry.slot}
                                </span>

                                {/* Player info or placeholder */}
                                {entry.player ? (
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-white truncate">
                                            {entry.player.fullName}
                                        </div>
                                        <div className="text-[10px] text-gray-500">
                                            {entry.player.position} · {entry.player.team ?? '—'}
                                            {entry.player.injuryStatus && entry.player.injuryStatus !== 'Active' && (
                                                <span className="ml-1.5 text-red-400">{entry.player.injuryStatus}</span>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="flex-1 text-sm text-gray-600">
                                        {isActive ? 'Type to search…' : `Select ${entry.slot}`}
                                    </span>
                                )}

                                {/* Points */}
                                {pts !== null && (
                                    <span className="text-xs font-bold text-[#D4AF37] shrink-0 ml-auto">
                                        {pts.toFixed(1)} pts
                                    </span>
                                )}

                                {/* Clear button */}
                                {entry.player && (
                                    <button
                                        className="text-gray-600 hover:text-gray-400 text-sm shrink-0 ml-2"
                                        onClick={e => { e.stopPropagation(); clearSlot(i); }}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>

                            {/* Inline search dropdown */}
                            {isActive && (
                                <div className="mt-1 rounded-xl border border-[#D4AF37]/30 bg-gray-900 shadow-xl overflow-hidden z-10">
                                    <div className="px-3 pt-2">
                                        <input
                                            autoFocus
                                            value={query}
                                            onChange={e => search(e.target.value)}
                                            placeholder={`Search ${slotPositionFilter(entry.slot)} players…`}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50"
                                        />
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {searching && (
                                            <div className="px-4 py-3 text-xs text-gray-500">Searching…</div>
                                        )}
                                        {!searching && query.length >= 2 && results.length === 0 && (
                                            <div className="px-4 py-3 text-xs text-gray-500">No players found</div>
                                        )}
                                        {results.map(player => {
                                            const alreadyUsed = selectedIds.has(player.playerId);
                                            const ppts        = projPoints(player, scoringType);
                                            return (
                                                <button
                                                    key={player.playerId}
                                                    disabled={alreadyUsed}
                                                    onClick={() => !alreadyUsed && selectPlayer(player)}
                                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left border-t border-gray-800 transition ${
                                                        alreadyUsed
                                                            ? 'opacity-40 cursor-not-allowed'
                                                            : 'hover:bg-gray-800 cursor-pointer'
                                                    }`}
                                                >
                                                    <div>
                                                        <div className="text-sm font-semibold text-white">
                                                            {player.fullName}
                                                            {alreadyUsed && <span className="ml-1 text-[9px] text-gray-500">already in lineup</span>}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500">
                                                            {player.position} · {player.team ?? '—'}
                                                            {player.injuryStatus && player.injuryStatus !== 'Active' && (
                                                                <span className="ml-1 text-red-400">{player.injuryStatus}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {ppts > 0 && (
                                                        <span className="text-xs text-[#D4AF37] font-bold shrink-0 ml-3">
                                                            {ppts.toFixed(1)} pts
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer — total + submit */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-800">
                <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Projected Total</div>
                    <div className="text-2xl font-black text-[#D4AF37] tabular-nums">
                        {totalProj.toFixed(1)}
                        <span className="text-xs font-normal text-gray-500 ml-1">pts</span>
                    </div>
                </div>

                <div className="text-right space-y-1">
                    {saveError && <p className="text-xs text-red-400">{saveError}</p>}
                    {saved && <p className="text-xs text-emerald-400">Lineup saved!</p>}
                    <button
                        onClick={submit}
                        disabled={saving || !allFilled}
                        className="px-6 py-2.5 rounded-xl font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : allFilled ? 'Submit Lineup' : `Fill all ${entries.length} slots`}
                    </button>
                </div>
            </div>
        </div>
    );
}
