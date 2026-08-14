'use client';

import { useState, useMemo } from 'react';

const POS_COLORS: Record<string, string> = {
    QB:  'bg-red-900/40 text-red-300 border-red-800',
    RB:  'bg-green-900/40 text-green-300 border-green-800',
    WR:  'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:  'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    K:   'bg-purple-900/40 text-purple-300 border-purple-800',
    DEF: 'bg-gray-800 text-gray-300 border-gray-700',
};

const INJURY_COLORS: Record<string, string> = {
    IR:           'text-red-400',
    Out:          'text-red-400',
    Doubtful:     'text-orange-400',
    Questionable: 'text-yellow-400',
};

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

interface Player {
    playerId:       string;
    name:           string;
    position:       string;
    team:           string | null;
    age:            number | null;
    adp:            number;
    realPtsPerGame: number | null;
    hasRealData:    boolean;
    injuryStatus:   string | null;
    projection:     number | null;
}

interface Props {
    players: Player[];
    week:    number;
}

export default function RedraftBigBoard({ players, week }: Props) {
    const [posFilter, setPosFilter] = useState('All');
    const [search, setSearch]       = useState('');
    const showProj = week > 0 && players.some(p => p.projection !== null && p.projection > 0);

    const filtered = useMemo(() => {
        let list = players;
        if (posFilter !== 'All') list = list.filter(p => p.position === posFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || (p.team ?? '').toLowerCase().includes(q));
        }
        return list;
    }, [players, posFilter, search]);

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 flex-wrap">
                    {POSITIONS.map(pos => (
                        <button
                            key={pos}
                            type="button"
                            onClick={() => setPosFilter(pos)}
                            className={[
                                'px-3 py-1 rounded-lg text-xs font-semibold transition',
                                posFilter === pos
                                    ? 'bg-[#D4AF37] text-gray-950'
                                    : 'bg-gray-800 text-gray-400 hover:text-gray-200',
                            ].join(' ')}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search player or team…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="ml-auto bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50 w-48"
                />
            </div>

            {/* Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[440px]">
                        <thead>
                            <tr className="border-b border-gray-800">
                                <th className="text-left px-4 py-3 text-gray-500 font-medium w-12">Rank</th>
                                <th className="text-left px-4 py-3 text-gray-500 font-medium">Player</th>
                                <th className="text-left px-3 py-3 text-gray-500 font-medium">Pos</th>
                                <th className="text-left px-3 py-3 text-gray-500 font-medium hidden sm:table-cell">Team</th>
                                <th className="text-right px-3 py-3 text-gray-500 font-medium hidden sm:table-cell">Age</th>
                                {showProj && (
                                    <th className="text-right px-3 py-3 text-gray-500 font-medium">Proj Wk {week}</th>
                                )}
                                <th className="text-right px-4 py-3 text-gray-500 font-medium">Pts/Gm</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p, i) => (
                                <tr key={p.playerId} className="border-t border-gray-800/50 hover:bg-gray-800/20 transition">
                                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{i + 1}</td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-white font-medium">{p.name}</span>
                                            {p.injuryStatus && p.injuryStatus !== 'Active' && (
                                                <span className={`text-[10px] font-bold ${INJURY_COLORS[p.injuryStatus] ?? 'text-orange-400'}`}>
                                                    {p.injuryStatus.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[p.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                            {p.position}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-gray-400 hidden sm:table-cell">
                                        {p.team ?? <span className="text-gray-700">FA</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-gray-400 hidden sm:table-cell">
                                        {p.age ?? <span className="text-gray-700">—</span>}
                                    </td>
                                    {showProj && (
                                        <td className="px-3 py-2.5 text-right font-semibold text-green-400">
                                            {p.projection != null && p.projection > 0
                                                ? p.projection.toFixed(1)
                                                : <span className="text-gray-600">—</span>}
                                        </td>
                                    )}
                                    <td className="px-4 py-2.5 text-right font-bold text-[#D4AF37]">
                                        {p.hasRealData ? (
                                            p.realPtsPerGame!.toFixed(1)
                                        ) : p.adp < 999 ? (
                                            <span className="font-normal text-gray-500" title="No season stats yet — ranked by ADP">
                                                ADP {p.adp}
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={showProj ? 7 : 6} className="px-4 py-10 text-center text-gray-600">
                                        No players found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
                    Real points/game under your league&apos;s exact scoring settings{showProj ? ` · Projections for Week ${week}` : ''} · {filtered.length} players shown
                </div>
            </div>
        </div>
    );
}
