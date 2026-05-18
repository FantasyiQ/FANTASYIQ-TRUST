'use client';

import { useState, useMemo } from 'react';
import {
    filterPlayers,
    sortPlayers,
    sortArrow,
    formatProj,
    POS_COLORS,
    type RankingPlayer,
    type SortKey,
    type SortDir,
} from '@/lib/rankings/rankingsUtils';

const POS_ORDER = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// ── Sortable column header ────────────────────────────────────────────────────

function SortTh({
    label, colKey, sortKey, sortDir, onSort, className = '',
}: {
    label: string; colKey: SortKey; sortKey: SortKey; sortDir: SortDir;
    onSort: (k: SortKey) => void; className?: string;
}) {
    return (
        <th
            onClick={() => onSort(colKey)}
            className={`px-3 py-3 font-medium cursor-pointer select-none whitespace-nowrap transition-colors
                ${colKey === sortKey ? 'text-white' : 'text-gray-500 hover:text-gray-300'} ${className}`}
        >
            {label}
            <span className="ml-0.5 text-[10px] opacity-60">{sortArrow(colKey, sortKey, sortDir)}</span>
        </th>
    );
}

// ── Injury badge ──────────────────────────────────────────────────────────────

function InjuryBadge({ status }: { status: string | null }) {
    if (!status || status === 'Active') return null;
    const color =
        status === 'Out' || status === 'IR' || status === 'PUP' ? 'text-red-400' :
        status === 'Doubtful'                                    ? 'text-orange-400' :
                                                                   'text-yellow-400';
    return <span className={`text-[9px] font-semibold ml-1 ${color}`}>({status})</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RankingsHub({
    players, season, week,
}: {
    players: RankingPlayer[];
    season:  string;
    week:    number;
}) {
    const [posFilter, setPosFilter] = useState('ALL');
    const [search,    setSearch]    = useState('');
    const [sortKey,   setSortKey]   = useState<SortKey>('baseProj');
    const [sortDir,   setSortDir]   = useState<SortDir>('desc');

    function handleSort(key: SortKey) {
        if (key === sortKey) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    }

    const posFilterOptions = useMemo(() => {
        const present = new Set(players.map(p => p.position));
        return POS_ORDER.filter(p => p === 'ALL' || present.has(p));
    }, [players]);

    const filtered = useMemo(() => filterPlayers(players, posFilter, search), [players, posFilter, search]);
    const sorted   = useMemo(() => sortPlayers(filtered, sortKey, sortDir),   [filtered, sortKey, sortDir]);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="font-bold text-white">Player Projections</h2>
                <p className="text-gray-500 text-xs mt-0.5">Week {week} projections · {season} season</p>
            </div>

            {/* Filter bar */}
            <div className="px-6 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-2 flex-wrap">
                    {posFilterOptions.map(pos => (
                        <button
                            key={pos}
                            type="button"
                            onClick={() => setPosFilter(pos)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition border
                                ${posFilter === pos
                                    ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                    : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search players or teams…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-44"
                />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-800 text-left">
                            <th className="text-gray-500 font-medium px-4 py-3 w-10">#</th>
                            <SortTh label="Player"  colKey="name"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                            <SortTh label="Pos"     colKey="position" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                            <th className="text-gray-500 font-medium px-3 py-3">Team</th>
                            <SortTh label="Proj"    colKey="baseProj" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/40">
                        {sorted.length > 0 ? sorted.map((p, i) => (
                            <tr key={p.playerId} className="hover:bg-gray-800/20 transition-colors">
                                <td className="px-4 py-2.5 text-gray-600 text-xs tabular-nums">{i + 1}</td>
                                <td className="px-3 py-2.5">
                                    <div className="hidden sm:flex items-center gap-1.5">
                                        <span className="text-white font-medium">{p.name}</span>
                                        <InjuryBadge status={p.injuryStatus} />
                                    </div>
                                    <div className="sm:hidden">
                                        <div className="text-white font-medium text-sm">{p.name}<InjuryBadge status={p.injuryStatus} /></div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className={`text-[10px] font-bold px-1 py-px rounded border ${POS_COLORS[p.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                                {p.position}
                                            </span>
                                            <span className="text-gray-500 text-[10px]">{p.team}</span>
                                            <span className="text-white font-bold text-xs ml-auto">{formatProj(p.baseProj)}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-2.5 hidden sm:table-cell">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[p.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                        {p.position}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-400 hidden sm:table-cell">{p.team}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-white hidden sm:table-cell tabular-nums">
                                    {formatProj(p.baseProj)}
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center text-gray-600">
                                    No players match your filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
