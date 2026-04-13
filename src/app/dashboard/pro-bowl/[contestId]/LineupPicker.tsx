'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface LineupSlot {
    position: string;
    playerName: string;
    nflTeam: string;
}

interface PlayerResult {
    fullName: string;
    position: string;
    team: string;
}

// ── Team normalization (mirrors server) ────────────────────────────────────────
const ALIASES: Record<string, string> = {
    ari:'ARI',arizona:'ARI',cardinals:'ARI',
    atl:'ATL',atlanta:'ATL',falcons:'ATL',
    bal:'BAL',baltimore:'BAL',ravens:'BAL',
    buf:'BUF',buffalo:'BUF',bills:'BUF',
    car:'CAR',carolina:'CAR',panthers:'CAR',
    chi:'CHI',chicago:'CHI',bears:'CHI',
    cin:'CIN',cincinnati:'CIN',bengals:'CIN',
    cle:'CLE',cleveland:'CLE',browns:'CLE',
    dal:'DAL',dallas:'DAL',cowboys:'DAL',
    den:'DEN',denver:'DEN',broncos:'DEN',
    det:'DET',detroit:'DET',lions:'DET',
    gb:'GB','green bay':'GB',packers:'GB',
    hou:'HOU',houston:'HOU',texans:'HOU',
    ind:'IND',indianapolis:'IND',colts:'IND',
    jax:'JAX',jac:'JAX',jacksonville:'JAX',jaguars:'JAX',
    kc:'KC','kansas city':'KC',chiefs:'KC',
    lv:'LV','las vegas':'LV',raiders:'LV',
    lac:'LAC',chargers:'LAC',
    lar:'LAR',rams:'LAR',
    mia:'MIA',miami:'MIA',dolphins:'MIA',
    min:'MIN',minnesota:'MIN',vikings:'MIN',
    ne:'NE','new england':'NE',patriots:'NE',
    no:'NO','new orleans':'NO',saints:'NO',
    nyg:'NYG',giants:'NYG',
    nyj:'NYJ',jets:'NYJ',
    phi:'PHI',philadelphia:'PHI',eagles:'PHI',
    pit:'PIT',pittsburgh:'PIT',steelers:'PIT',
    sf:'SF','san francisco':'SF','49ers':'SF',niners:'SF',
    sea:'SEA',seattle:'SEA',seahawks:'SEA',
    tb:'TB',tampa:'TB','tampa bay':'TB',buccaneers:'TB',bucs:'TB',
    ten:'TEN',tennessee:'TEN',titans:'TEN',
    was:'WAS',wsh:'WAS',washington:'WAS',commanders:'WAS',
};
function normalizeTeam(input: string): string | null {
    if (!input) return null;
    const clean = input.toLowerCase().replace(/\s*d\/?s[t]?\s*$/, '').trim();
    return ALIASES[clean] ?? null;
}
function isSlotLocked(nflTeam: string, lockedTeams: string[]): boolean {
    const abbrev = normalizeTeam(nflTeam);
    return abbrev ? lockedTeams.includes(abbrev) : false;
}

// ── Position colours ───────────────────────────────────────────────────────────
function positionColor(pos: string) {
    switch (pos) {
        case 'QB':         return 'text-red-400';
        case 'RB':         return 'text-green-400';
        case 'WR':         return 'text-blue-400';
        case 'TE':         return 'text-yellow-400';
        case 'FLEX':       return 'text-purple-400';
        case 'SUPER_FLEX': return 'text-pink-400';
        case 'K':          return 'text-gray-400';
        case 'DEF':        return 'text-orange-400';
        default:           return 'text-gray-400';
    }
}

function flexNote(positions: string[]): string {
    const notes: string[] = [];
    if (positions.includes('FLEX'))       notes.push('FLEX can be RB, WR, or TE.');
    if (positions.includes('SUPER_FLEX')) notes.push('SUPER_FLEX can be QB, RB, WR, or TE.');
    return notes.join('  ');
}

// ── Player autocomplete for a single slot ─────────────────────────────────────
function PlayerSearch({
    slot,
    slotIndex,
    locked,
    onChange,
}: {
    slot:       LineupSlot;
    slotIndex:  number;
    locked:     boolean;
    onChange:   (index: number, player: PlayerResult) => void;
}) {
    const [query, setQuery]       = useState(slot.playerName);
    const [results, setResults]   = useState<PlayerResult[]>([]);
    const [open, setOpen]         = useState(false);
    const [loading, setLoading]   = useState(false);
    const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef            = useRef<HTMLDivElement>(null);

    // Keep query in sync if parent resets
    useEffect(() => { setQuery(slot.playerName); }, [slot.playerName]);

    // Close dropdown on outside click
    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const search = useCallback((q: string) => {
        if (q.length < 2) { setResults([]); setOpen(false); return; }
        setLoading(true);
        const url = `/api/pro-bowl/players?q=${encodeURIComponent(q)}&position=${encodeURIComponent(slot.position)}`;
        fetch(url)
            .then(r => r.json() as Promise<PlayerResult[]>)
            .then(data => { setResults(data); setOpen(data.length > 0); })
            .catch(() => { /* ignore */ })
            .finally(() => setLoading(false));
    }, [slot.position]);

    function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
        const val = e.target.value;
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(val), 250);
    }

    function selectPlayer(p: PlayerResult) {
        setQuery(p.fullName);
        setOpen(false);
        setResults([]);
        onChange(slotIndex, p);
    }

    if (locked) {
        return (
            <div className="flex-1 flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 opacity-60">
                <span className="text-white text-sm flex-1 truncate">{slot.playerName || '—'}</span>
                {slot.nflTeam && <span className="text-gray-500 text-xs shrink-0">{slot.nflTeam}</span>}
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex-1 relative">
            <div className="flex gap-2">
                <div className="relative flex-1">
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
                {slot.nflTeam && (
                    <span className="shrink-0 self-center text-xs font-bold text-gray-400 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2">
                        {slot.nflTeam}
                    </span>
                )}
            </div>

            {open && results.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                    {results.map((p, i) => (
                        <li key={i}>
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

// ── Main LineupPicker ──────────────────────────────────────────────────────────
export default function LineupPicker({
    contestId,
    rosterPositions,
    lockedTeams,
    existingLineup,
}: {
    contestId:       string;
    rosterPositions: string[];
    lockedTeams:     string[];
    existingLineup:  LineupSlot[] | null;
}) {
    const blankRoster = rosterPositions.map(p => ({ position: p, playerName: '', nflTeam: '' }));
    const [lineup, setLineup] = useState<LineupSlot[]>(existingLineup ?? blankRoster);
    const [loading, setLoading] = useState(false);
    const [error, setError]    = useState('');
    const [saved, setSaved]    = useState(false);

    function selectPlayer(index: number, player: PlayerResult) {
        setSaved(false);
        setLineup(prev => prev.map((slot, i) =>
            i === index ? { ...slot, playerName: player.fullName, nflTeam: player.team } : slot
        ));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSaved(false);

        for (const slot of lineup) {
            if (isSlotLocked(slot.nflTeam, lockedTeams)) continue;
            if (!slot.playerName.trim()) {
                setError(`Select a player for the ${slot.position} slot.`);
                return;
            }
        }

        setLoading(true);
        const res = await fetch(`/api/pro-bowl/${contestId}/entry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lineup }),
        });
        const data = await res.json();
        setLoading(false);
        if (!res.ok) { setError(data.error ?? 'Failed to save lineup.'); return; }
        setSaved(true);
    }

    const lockedCount      = lineup.filter(s => isSlotLocked(s.nflTeam, lockedTeams)).length;
    const unlockedUnfilled = lineup.filter(s => !isSlotLocked(s.nflTeam, lockedTeams) && !s.playerName.trim()).length;
    const note             = flexNote(rosterPositions);

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {lockedCount > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-xl px-4 py-3 text-yellow-400 text-sm">
                    🔒 {lockedCount} slot{lockedCount !== 1 ? 's' : ''} locked — game{lockedCount !== 1 ? 's' : ''} in progress.
                </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                    <h2 className="font-bold">Pick Your Lineup</h2>
                    <p className="text-gray-500 text-xs mt-1">Search any active NFL player. Slots lock automatically when that team&apos;s game kicks off.</p>
                </div>

                <div className="divide-y divide-gray-800/50">
                    {lineup.map((slot, i) => {
                        const locked = isSlotLocked(slot.nflTeam, lockedTeams);
                        return (
                            <div key={i} className={`px-6 py-3.5 flex items-center gap-3 ${locked ? 'opacity-60' : ''}`}>
                                <div className="flex items-center gap-1 w-16 shrink-0">
                                    <span className={`text-xs font-bold ${positionColor(slot.position)}`}>{slot.position}</span>
                                    {locked && <span className="text-xs">🔒</span>}
                                </div>
                                <PlayerSearch
                                    slot={slot}
                                    slotIndex={i}
                                    locked={locked}
                                    onChange={selectPlayer}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            {note && <p className="text-xs text-gray-600 px-1">{note}</p>}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {saved && (
                <p className="text-green-400 text-sm font-medium">
                    Lineup saved! {lockedCount > 0 ? 'Locked slots are final.' : 'Slots lock when games begin.'}
                </p>
            )}

            <button
                type="submit"
                disabled={loading || unlockedUnfilled > 0}
                className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold py-3 rounded-xl text-sm transition">
                {loading ? 'Saving…' : existingLineup ? 'Update Lineup' : 'Submit Lineup'}
            </button>
        </form>
    );
}
