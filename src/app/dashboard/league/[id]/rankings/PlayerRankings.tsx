'use client';

import { useState, useMemo, useEffect } from 'react';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { LeagueSettings, LeagueType, PprFormat, Player } from '@/lib/trade-engine';
import type { UniversePlayer, UniverseResponse } from '@/lib/player-universe';
import { computePlayerBaseValue } from '@/lib/player-universe';

const POS_FILTER_OPTIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'PICK'];

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
    PICK: 'bg-indigo-900/40 text-indigo-300 border-indigo-700',
};

export default function PlayerRankings({
    ppr,
    leagueType,
    leagueSettings,
}: {
    ppr:            PprFormat;
    leagueType:     LeagueType;
    leagueSettings: LeagueSettings;
}) {
    const [posFilter, setPosFilter] = useState('All');
    const [search,    setSearch]    = useState('');
    const [universe,  setUniverse]  = useState<UniversePlayer[]>([]);
    const superflex = leagueSettings.sfSlots > 0;

    useEffect(() => {
        fetch('/api/players/universe')
            .then(r => r.json())
            .then((data: UniverseResponse) => setUniverse(data.players))
            .catch(() => {});
    }, []);

    const ranked = useMemo(() => {
        if (!universe.length) return [];
        return universe.map((u, i) => {
            const p: Player = {
                rank: i + 1, name: u.name, position: u.position, team: u.team ?? 'FA',
                age: u.age ?? 0,
                baseValue: computePlayerBaseValue(u, u.position, { leagueType, superflex, ppr, leagueSize: 12, passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe }),
                injuryStatus: u.injuryStatus,
            };
            return { p, dtv: calcDtv(p, ppr, leagueType, undefined, leagueSettings) };
        }).sort((a, b) => b.dtv.finalDtv - a.dtv.finalDtv || a.p.name.localeCompare(b.p.name));
    }, [universe, ppr, leagueType, leagueSettings, superflex]);

    const filtered = useMemo(() => {
        let list = ranked;
        if (posFilter !== 'All') list = list.filter(({ p }) => p.position === posFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(({ p }) => p.name.toLowerCase().includes(q));
        }
        return list.slice(0, 100);
    }, [ranked, posFilter, search]);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="font-semibold text-lg">Player Rankings</h2>
                <p className="text-gray-500 text-xs mt-0.5">DTV values scoped to this league&apos;s roster and scoring settings.</p>
            </div>

            <div className="px-6 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-2 flex-wrap">
                    {POS_FILTER_OPTIONS.map(pos => (
                        <button key={pos} onClick={() => setPosFilter(pos)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${posFilter === pos ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
                            {pos}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search players…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-48"
                />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-500 text-left border-b border-gray-800">
                            <th className="px-4 py-3 font-medium w-10">#</th>
                            <th className="px-3 py-3 font-medium">Player</th>
                            <th className="px-3 py-3 font-medium">Pos</th>
                            <th className="px-3 py-3 font-medium">Team</th>
                            <th className="px-3 py-3 font-medium text-right">DTV</th>
                            <th className="px-4 py-3 font-medium text-right">Tier</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(({ p, dtv }, i) => (
                            <tr key={p.name} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
                                <td className="px-4 py-2.5 text-gray-600 text-xs">{i + 1}</td>
                                <td className="px-3 py-2.5 text-white font-medium">{p.name}</td>
                                <td className="px-3 py-2.5">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${POS_COLORS[p.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                        {p.position}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-400">{p.team}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-white">{dtv.finalDtv}</td>
                                <td className={`px-4 py-2.5 text-right font-semibold text-xs ${TIER_COLORS[dtv.tier] ?? 'text-gray-400'}`}>{dtv.tier}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-600">No players match your filter.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {filtered.length >= 100 && (
                <div className="px-6 py-3 border-t border-gray-800 text-center text-gray-600 text-xs">
                    Showing top 100 — use the Trade Evaluator for full analysis.
                </div>
            )}
        </div>
    );
}
