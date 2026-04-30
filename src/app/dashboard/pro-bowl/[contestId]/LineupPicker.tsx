"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SlotConfig = {
    position:         string;
    allowedPositions: string[];
};

export type Contest = {
    id:               string;
    rosterConfigJson: { slots: SlotConfig[] };
};

export type EntrySlot = {
    position: string;
    playerId: string | null;
    // display-only — enriched by server for existing entries, populated on select
    fullName?: string;
    team?:     string;
};

type PlayerResult = {
    playerId: string;
    fullName: string;
    position: string;
    team:     string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function positionColor(pos: string) {
    switch (pos) {
        case "QB":         return "text-red-400";
        case "RB":         return "text-green-400";
        case "WR":         return "text-blue-400";
        case "TE":         return "text-yellow-400";
        case "FLEX":       return "text-purple-400";
        case "SUPER_FLEX": return "text-pink-400";
        case "K":          return "text-gray-400";
        case "DEF":        return "text-orange-400";
        default:           return "text-gray-400";
    }
}

// ── PlayerPool ────────────────────────────────────────────────────────────────

function PlayerPool({
    slotPosition,
    selected,
    onSelect,
    onClear,
}: {
    slotPosition: string;
    selected:     EntrySlot;
    onSelect:     (player: PlayerResult) => void;
    onClear:      () => void;
}) {
    const [query,   setQuery]   = useState("");
    const [results, setResults] = useState<PlayerResult[]>([]);
    const [open,    setOpen]    = useState(false);
    const [loading, setLoading] = useState(false);
    const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef          = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    const search = useCallback((q: string) => {
        if (q.length < 2) { setResults([]); setOpen(false); return; }
        setLoading(true);
        fetch(`/api/pro-bowl/players?q=${encodeURIComponent(q)}&position=${encodeURIComponent(slotPosition)}`)
            .then(r => r.json() as Promise<PlayerResult[]>)
            .then(data => { setResults(data); setOpen(data.length > 0); })
            .catch(() => { /* ignore */ })
            .finally(() => setLoading(false));
    }, [slotPosition]);

    function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
        const val = e.target.value;
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(val), 250);
    }

    function selectPlayer(p: PlayerResult) {
        setQuery("");
        setOpen(false);
        setResults([]);
        onSelect(p);
    }

    // ── Selected state ────────────────────────────────────────────────────────
    if (selected.playerId) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                    <span className="text-white text-sm font-medium flex-1 truncate">
                        {selected.fullName ?? selected.playerId}
                    </span>
                    {selected.team && (
                        <span className="text-gray-500 text-xs shrink-0">{selected.team}</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-gray-600 hover:text-gray-300 text-xs px-2 py-2 transition"
                    aria-label="Clear player">
                    ✕
                </button>
            </div>
        );
    }

    // ── Search state ──────────────────────────────────────────────────────────
    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search player…"
                    value={query}
                    onChange={handleInput}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    autoComplete="off"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                />
                {loading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">…</span>
                )}
            </div>

            {open && results.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                    {results.map((p) => (
                        <li key={p.playerId}>
                            <button
                                type="button"
                                onMouseDown={() => selectPlayer(p)}
                                className="w-full text-left px-4 py-2.5 hover:bg-gray-700 flex items-center justify-between gap-3 transition">
                                <span className="text-white text-sm font-medium">{p.fullName}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-xs font-bold ${positionColor(p.position)}`}>{p.position}</span>
                                    <span className="text-gray-500 text-xs">{p.team}</span>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ── LineupPicker ──────────────────────────────────────────────────────────────

export default function LineupPicker({
    contest,
    initialSlots,
}: {
    contest:      Contest;
    initialSlots: EntrySlot[] | null;
}) {
    const roster = contest.rosterConfigJson.slots;

    const [slots, setSlots] = useState<EntrySlot[]>(
        initialSlots?.length
            ? initialSlots
            : roster.map((s) => ({ position: s.position, playerId: null })),
    );
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState("");
    const [saved,  setSaved]  = useState(false);

    function updateSlot(index: number, player: PlayerResult) {
        setSaved(false);
        setSlots(prev => prev.map((s, i) =>
            i === index
                ? { ...s, playerId: player.playerId, fullName: player.fullName, team: player.team }
                : s,
        ));
    }

    function clearSlot(index: number) {
        setSaved(false);
        setSlots(prev => prev.map((s, i) =>
            i === index
                ? { position: s.position, playerId: null, fullName: undefined, team: undefined }
                : s,
        ));
    }

    async function submit() {
        setError("");
        setSaved(false);
        setSaving(true);

        const res = await fetch(`/api/pro-bowl/${contest.id}/entry`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
                slots: slots.map(s => ({ position: s.position, playerId: s.playerId })),
            }),
        });

        const data = await res.json();
        setSaving(false);
        if (!res.ok) { setError(data.error ?? "Failed to save lineup."); return; }
        setSaved(true);
    }

    const allFilled = slots.every(s => s.playerId);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold">Set Your Pro‑Bowl Lineup</h2>

            <div className="space-y-3">
                {roster.map((slotConfig, i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs font-bold ${positionColor(slotConfig.position)}`}>
                                {slotConfig.position}
                            </span>
                            {slotConfig.allowedPositions.length > 1 && (
                                <span className="text-gray-600 text-xs">
                                    ({slotConfig.allowedPositions.join(", ")})
                                </span>
                            )}
                        </div>

                        <PlayerPool
                            slotPosition={slotConfig.position}
                            selected={slots[i]}
                            onSelect={(p) => updateSlot(i, p)}
                            onClear={() => clearSlot(i)}
                        />
                    </div>
                ))}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {saved && (
                <p className="text-green-400 text-sm font-medium">
                    Lineup saved! Entries lock when the contest closes.
                </p>
            )}

            <button
                onClick={submit}
                disabled={saving || !allFilled}
                className="w-full px-4 py-3 rounded-xl bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black text-sm font-bold transition">
                {saving ? "Saving…" : initialSlots ? "Update Lineup" : "Submit Lineup"}
            </button>
        </div>
    );
}
