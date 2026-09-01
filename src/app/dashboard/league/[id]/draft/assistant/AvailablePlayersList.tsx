'use client';

import { useMemo, useState } from 'react';
import { normalizePosition } from '@/lib/draft/context';

export interface AvailablePlayer {
    id:               string;   // sleeperPlayerId or espnPlayerId, platform-neutral here
    name:             string;
    position:         string;
    team:             string | null;
    age:              number | null;
    fiqScore:         number;
    tier:             number;
    opportunityScore: number | null;
    injuryStatus:     string | null;
}

interface Props {
    players: AvailablePlayer[];
}

const POS_COLORS: Record<string, string> = {
    QB:  'bg-red-900/40 text-red-300 border-red-700/60',
    RB:  'bg-blue-900/40 text-blue-300 border-blue-700/60',
    WR:  'bg-green-900/40 text-green-300 border-green-700/60',
    TE:  'bg-orange-900/40 text-orange-300 border-orange-700/60',
    K:   'bg-gray-800 text-gray-400 border-gray-700',
    IDP: 'bg-purple-900/40 text-purple-300 border-purple-700/60',
};

// Individual defensive positions (EDGE, DL, LB, DB, etc.) all display under a
// single IDP badge/filter — same grouping the backend's normalizePosition()
// already applies for allowedPositions, so a player showing up here for an
// IDP league doesn't fall through the offense-only QB/RB/WR/TE/K/DEF set.
function displayPosition(pos: string): string {
    const norm = normalizePosition(pos);
    return norm === 'IDP' ? 'IDP' : pos;
}

function posBadge(pos: string) {
    return POS_COLORS[displayPosition(pos)] ?? 'bg-gray-800 text-gray-400 border-gray-700';
}

function fiqColor(score: number) {
    if (score >= 85) return 'text-[#D4AF37]';
    if (score >= 75) return 'text-green-400';
    if (score >= 65) return 'text-blue-400';
    return 'text-gray-400';
}

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'IDP'];
type SortKey = 'fiqScore' | 'name' | 'tier' | 'position';

// Standard roster order, not alphabetical — QB/RB/WR/TE/K/DEF reads naturally;
// anything unrecognized (including all IDP positions) sorts after.
const POSITION_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5, IDP: 6 };

export default function AvailablePlayersList({ players }: Props) {
    const [search, setSearch]     = useState('');
    const [position, setPosition] = useState('ALL');
    const [sortKey, setSortKey]   = useState<SortKey>('fiqScore');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return players
            .filter(p => position === 'ALL' || displayPosition(p.position) === position)
            .filter(p => !q || p.name.toLowerCase().includes(q))
            .sort((a, b) => {
                if (sortKey === 'name')     return a.name.localeCompare(b.name);
                if (sortKey === 'tier')     return a.tier - b.tier || b.fiqScore - a.fiqScore;
                if (sortKey === 'position') {
                    const posDiff = (POSITION_ORDER[displayPosition(a.position)] ?? 99) - (POSITION_ORDER[displayPosition(b.position)] ?? 99);
                    return posDiff || b.fiqScore - a.fiqScore;
                }
                return b.fiqScore - a.fiqScore;
            });
    }, [players, search, position, sortKey]);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="p-4 space-y-3 border-b border-gray-800">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                        Available Players <span className="text-gray-600 normal-case font-normal">({filtered.length})</span>
                    </p>
                    <select
                        value={sortKey}
                        onChange={e => setSortKey(e.target.value as SortKey)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-gray-500"
                    >
                        <option value="fiqScore">Sort: FiQ Score</option>
                        <option value="tier">Sort: Tier</option>
                        <option value="position">Sort: Position</option>
                        <option value="name">Sort: Name</option>
                    </select>
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search players…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
                <div className="flex gap-1.5 flex-wrap">
                    {POSITIONS.map(pos => (
                        <button
                            key={pos}
                            type="button"
                            onClick={() => setPosition(pos)}
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition ${
                                position === pos
                                    ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                                    : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500'
                            }`}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-800/60">
                {filtered.length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-8">No players match.</p>
                )}
                {filtered.map(p => (
                    <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${posBadge(p.position)}`}>
                            {p.position}
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{p.name}</p>
                            <p className="text-gray-600 text-[11px]">
                                {p.team ?? 'FA'}{p.age ? ` · Age ${p.age}` : ''}
                                {p.injuryStatus && <span className="text-red-400/80"> · {p.injuryStatus}</span>}
                            </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-gray-800 text-gray-500 border-gray-700">
                            T{p.tier}
                        </span>
                        <span className={`shrink-0 text-xs font-bold w-10 text-right ${fiqColor(p.fiqScore)}`}>
                            {p.fiqScore}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
