'use client';

import { useState, useMemo } from 'react';
import { PLAYERS, getDraftPicks, evaluateTrade, calcDtv } from '@/lib/trade-engine';
import type { Player, PprFormat, LeagueType, DtvResult } from '@/lib/trade-engine';

const LEAGUE_SIZES = [8, 10, 12, 14, 16, 32] as const;
type LeagueSize = typeof LEAGUE_SIZES[number];

const TIER_COLORS: Record<string, string> = {
    Elite:   'text-[#C8A951]',
    Star:    'text-green-400',
    Starter: 'text-blue-400',
    Flex:    'text-gray-300',
    Bench:   'text-orange-400',
    Waiver:  'text-red-400',
};

const POS_COLORS: Record<string, string> = {
    QB:   'bg-red-900/40 text-red-300 border-red-800',
    RB:   'bg-green-900/40 text-green-300 border-green-800',
    WR:   'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:   'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    K:    'bg-gray-800 text-gray-400 border-gray-700',
    DEF:  'bg-purple-900/40 text-purple-300 border-purple-800',
    PICK: 'bg-indigo-900/40 text-indigo-300 border-indigo-700',
};

function verdictColor(v: string) {
    switch (v) {
        case 'Slam Dunk':  return 'text-[#C8A951]';
        case 'Strong Win': return 'text-green-400';
        case 'Slight Edge':return 'text-green-300';
        case 'Fair Trade': return 'text-gray-300';
        case 'Slight Loss':return 'text-orange-400';
        case 'Bad Deal':   return 'text-red-400';
        case 'Robbery':    return 'text-red-600';
        default:           return 'text-gray-400';
    }
}

function PlayerPill({ result, onRemove }: { result: DtvResult; onRemove: () => void }) {
    return (
        <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md border shrink-0 ${POS_COLORS[result.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                    {result.position}
                </span>
                <div className="min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{result.name}</p>
                    <p className="text-gray-500 text-xs">{result.position === 'PICK' ? `${result.team} Draft` : `${result.team}${result.age ? ` · Age ${result.age}` : ''}`}</p>
                </div>
            </div>
            <div className="text-right shrink-0">
                <p className={`font-bold text-sm ${TIER_COLORS[result.tier]}`}>{result.finalDtv}</p>
                <p className="text-gray-600 text-xs">{result.tier}</p>
            </div>
            <button onClick={onRemove} className="text-gray-700 hover:text-red-400 transition text-lg leading-none shrink-0">×</button>
        </div>
    );
}

function PlayerSearch({ onAdd, excluded, ppr, leagueType, players }: {
    onAdd: (p: Player) => void;
    excluded: string[];
    ppr: PprFormat;
    leagueType: LeagueType;
    players: Player[];
}) {
    const [query, setQuery] = useState('');

    const results = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return players
            .filter(p => !excluded.includes(p.name) && (
                p.name.toLowerCase().includes(q) ||
                p.position.toLowerCase().includes(q) ||
                p.team.toLowerCase().includes(q)
            ))
            .slice(0, 8);
    }, [query, excluded, players]);

    return (
        <div className="relative">
            <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search player, position, or team…"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
            />
            {results.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
                    {results.map(p => {
                        const dtv = calcDtv(p, ppr, leagueType);
                        return (
                            <li key={p.name}>
                                <button
                                    onClick={() => { onAdd(p); setQuery(''); }}
                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-700 transition text-left gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border shrink-0 ${POS_COLORS[p.position] ?? ''}`}>
                                            {p.position}
                                        </span>
                                        <span className="text-white text-sm truncate">{p.name}</span>
                                        <span className="text-gray-500 text-xs">{p.team}</span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className={`text-sm font-bold ${TIER_COLORS[dtv.tier]}`}>{dtv.finalDtv}</span>
                                        <span className="text-gray-600 text-xs ml-1">{dtv.tier}</span>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

interface TradeEvaluatorProps {
    initialPpr?:        PprFormat;
    initialLeagueSize?: LeagueSize;
    initialLeagueType?: LeagueType;
    leagueLabel?:       string;   // e.g. "Jungle League — PPR · 10 Teams"
}

export default function TradeEvaluator({
    initialPpr        = 0.5,
    initialLeagueSize = 12,
    initialLeagueType = 'Redraft',
    leagueLabel,
}: TradeEvaluatorProps = {}) {
    const [ppr, setPpr]               = useState<PprFormat>(initialPpr);
    const [leagueType, setLeagueType] = useState<LeagueType>(initialLeagueType);
    const [leagueSize, setLeagueSize] = useState<LeagueSize>(initialLeagueSize);
    const [posFilter, setPosFilter]   = useState('ALL');
    const [pickYear, setPickYear]     = useState(2026);
    const [sideA, setSideA]           = useState<Player[]>([]);
    const [sideB, setSideB]           = useState<Player[]>([]);

    const allExcluded = [...sideA.map(p => p.name), ...sideB.map(p => p.name)];

    const draftPicks = useMemo(() => getDraftPicks(leagueSize), [leagueSize]);
    const allPlayers = useMemo(() => [...PLAYERS, ...draftPicks], [draftPicks]);

    const result = useMemo(() => {
        if (sideA.length === 0 && sideB.length === 0) return null;
        return evaluateTrade(sideA, sideB, ppr, leagueType);
    }, [sideA, sideB, ppr, leagueType]);

    const positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'PICK'];

    const filteredPlayers = useMemo(() =>
        allPlayers.filter(p => posFilter === 'ALL' || p.position === posFilter),
        [allPlayers, posFilter]
    );

    return (
        <div className="space-y-6">
            {/* League badge */}
            {leagueLabel && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#C8A951]/10 border border-[#C8A951]/30 rounded-xl w-fit">
                    <span className="text-[#C8A951] text-xs font-semibold">⚙ Configured for:</span>
                    <span className="text-[#C8A951]/80 text-xs">{leagueLabel}</span>
                </div>
            )}

            {/* Settings row */}
            <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-400 text-sm font-medium">Format:</span>
                    {([
                        [0,         'Std'],
                        [0.5,       '½ PPR'],
                        [1,         'Full PPR'],
                        ['te_prem', 'TE Prem'],
                    ] as [PprFormat, string][]).map(([v, label]) => (
                        <button key={String(v)} onClick={() => setPpr(v)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${ppr === v ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm font-medium">Type:</span>
                    {(['Redraft', 'Dynasty'] as LeagueType[]).map(t => (
                        <button key={t} onClick={() => setLeagueType(t)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${leagueType === t ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm font-medium">League Size:</span>
                    {LEAGUE_SIZES.map(s => (
                        <button key={s} onClick={() => setLeagueSize(s)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${leagueSize === s ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Trade sides */}
            <div className="grid md:grid-cols-2 gap-4">
                {/* Side A */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-white">You Give</h2>
                        {result && <span className="text-2xl font-extrabold text-white">{result.totalA}</span>}
                    </div>
                    <PlayerSearch onAdd={p => setSideA(prev => prev.length < 5 ? [...prev, p] : prev)} excluded={allExcluded} ppr={ppr} leagueType={leagueType} players={allPlayers} />
                    <div className="space-y-2">
                        {result?.sideA.map(r => (
                            <PlayerPill key={r.name} result={r} onRemove={() => setSideA(prev => prev.filter(p => p.name !== r.name))} />
                        ))}
                        {sideA.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Search and add up to 5 players</p>}
                    </div>
                </div>

                {/* Side B */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-white">You Receive</h2>
                        {result && <span className="text-2xl font-extrabold text-white">{result.totalB}</span>}
                    </div>
                    <PlayerSearch onAdd={p => setSideB(prev => prev.length < 5 ? [...prev, p] : prev)} excluded={allExcluded} ppr={ppr} leagueType={leagueType} players={allPlayers} />
                    <div className="space-y-2">
                        {result?.sideB.map(r => (
                            <PlayerPill key={r.name} result={r} onRemove={() => setSideB(prev => prev.filter(p => p.name !== r.name))} />
                        ))}
                        {sideB.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Search and add up to 5 players</p>}
                    </div>
                </div>
            </div>

            {/* Verdict */}
            {result && (sideA.length > 0 || sideB.length > 0) && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
                    <h2 className="font-bold">Trade Verdict</h2>
                    <div className="grid sm:grid-cols-3 gap-4 text-center">
                        <div>
                            <p className="text-gray-500 text-xs mb-1">You Give</p>
                            <p className="text-3xl font-extrabold text-white">{result.totalA}</p>
                            <p className="text-gray-500 text-xs mt-1">DTV</p>
                        </div>
                        <div className="flex flex-col items-center justify-center gap-1">
                            <p className={`text-xl font-extrabold ${verdictColor(result.verdict)}`}>{result.verdict}</p>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-xs">Trade Score:</span>
                                <span className={`text-lg font-bold ${verdictColor(result.verdict)}`}>{result.score}</span>
                                <span className="text-gray-600 text-xs">/ 100</span>
                            </div>
                            <p className="text-gray-600 text-xs">
                                {result.winner === 'Even' ? 'Essentially even' :
                                 result.winner === 'A' ? `You overpay by ${result.diff}` :
                                 `You win by ${result.diff}`}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs mb-1">You Receive</p>
                            <p className="text-3xl font-extrabold text-white">{result.totalB}</p>
                            <p className="text-gray-500 text-xs mt-1">DTV</p>
                        </div>
                    </div>

                    {/* Bar comparison */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xs w-20 text-right shrink-0">You Give</span>
                            <div className="flex-1 bg-gray-800 rounded-full h-3">
                                <div className="bg-red-500 h-3 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, result.totalA / Math.max(result.totalA, result.totalB, 1) * 100)}%` }} />
                            </div>
                            <span className="text-white text-xs font-bold w-10">{result.totalA}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xs w-20 text-right shrink-0">You Get</span>
                            <div className="flex-1 bg-gray-800 rounded-full h-3">
                                <div className="bg-green-500 h-3 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, result.totalB / Math.max(result.totalA, result.totalB, 1) * 100)}%` }} />
                            </div>
                            <span className="text-white text-xs font-bold w-10">{result.totalB}</span>
                        </div>
                    </div>

                    {/* Score scale */}
                    <div className="text-xs text-gray-600 text-center">
                        0–14 Robbery · 15–29 Bad Deal · 30–44 Slight Loss · 45–59 Fair Trade · 60–74 Slight Edge · 75–89 Strong Win · 90–100 Slam Dunk
                    </div>
                </div>
            )}

            {/* Reference chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="font-bold">DTV Reference Chart</h2>
                        <p className="text-gray-500 text-xs mt-0.5">Values adjust for position scarcity, age curve ({leagueType}), and PPR format.</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {positions.map(pos => (
                            <button key={pos} onClick={() => setPosFilter(pos)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${posFilter === pos ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
                                {pos}
                            </button>
                        ))}
                    </div>
                </div>

                {posFilter === 'PICK' ? (
                    /* Pick grid view */
                    <div className="p-6 space-y-6">
                        {/* Year tabs */}
                        <div className="flex gap-2">
                            {[2026, 2027, 2028].map(y => (
                                <button key={y} onClick={() => setPickYear(y)}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition border ${pickYear === y ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                                    {y}
                                </button>
                            ))}
                        </div>

                        {/* Rounds */}
                        {[1, 2, 3, 4, 5].map(round => {
                            const roundPicks = draftPicks.filter(p =>
                                p.team === String(pickYear) && p.name.startsWith(`${pickYear} ${round}.`)
                            );
                            return (
                                <div key={round}>
                                    <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                                        Round {round}
                                    </h3>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                                        {roundPicks.map(p => {
                                            const dtv = calcDtv(p, ppr, leagueType);
                                            const pickLabel = p.name.split(' ')[1]; // e.g. "1.03"
                                            return (
                                                <div key={p.name}
                                                    className="bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-center hover:border-indigo-500/50 transition cursor-default">
                                                    <p className="text-indigo-300 font-bold text-sm">{pickLabel}</p>
                                                    <p className={`font-extrabold text-base ${TIER_COLORS[dtv.tier]}`}>{dtv.finalDtv}</p>
                                                    <p className="text-gray-600 text-xs">{dtv.tier}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* Standard player table */
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-800">
                                    <th className="text-left px-4 py-3 text-gray-500 font-medium w-10">#</th>
                                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Player</th>
                                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Pos</th>
                                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Team</th>
                                    <th className="text-right px-3 py-3 text-gray-500 font-medium">DTV</th>
                                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Tier</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50">
                                {filteredPlayers.map(p => {
                                    const dtv = calcDtv(p, ppr, leagueType);
                                    return (
                                        <tr key={p.name} className="hover:bg-gray-800/30 transition">
                                            <td className="px-4 py-3 text-gray-600 text-xs">{p.rank}</td>
                                            <td className="px-3 py-3 text-white font-medium">{p.name}</td>
                                            <td className="px-3 py-3">
                                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[p.position] ?? ''}`}>
                                                    {p.position}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-gray-400">{p.team}</td>
                                            <td className="px-3 py-3 text-right font-bold text-white">{dtv.finalDtv}</td>
                                            <td className={`px-4 py-3 text-right font-semibold text-xs ${TIER_COLORS[dtv.tier]}`}>{dtv.tier}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
