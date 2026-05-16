'use client';

import { useState, useMemo, useEffect } from 'react';
import { calcDtv, isIdpPosition } from '@/lib/trade-engine';
import type { LeagueSettings, LeagueType, PprFormat, Player } from '@/lib/trade-engine';
import type { UniversePlayer, UniverseResponse, UniverseMeta, DeltaEntry, DeltaResponse } from '@/lib/player-universe';
import { computePlayerBaseValue, playerVolatility } from '@/lib/player-universe';

const POS_FILTER_OPTIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK'];

const TIER_COLORS: Record<string, string> = {
    Elite:   'text-[#D4AF37]',
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

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return 'unknown';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1)  return 'just now';
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

export default function PlayerRankings({
    ppr,
    leagueType,
    leagueSettings,
}: {
    ppr:            PprFormat;
    leagueType:     LeagueType;
    leagueSettings: LeagueSettings;
}) {
    const [posFilter,    setPosFilter]    = useState('ALL');
    const [search,       setSearch]       = useState('');
    const [universe,     setUniverse]     = useState<UniversePlayer[]>([]);
    const [universeMeta, setUniverseMeta] = useState<UniverseMeta | null>(null);
    const [deltaEntries, setDeltaEntries] = useState<DeltaEntry[]>([]);
    const superflex = leagueSettings.sfSlots > 0;

    useEffect(() => {
        Promise.all([
            fetch('/api/players/universe').then(r => r.json() as Promise<UniverseResponse>),
            fetch('/api/players/delta').then(r => r.json() as Promise<DeltaResponse>),
        ]).then(([uData, dData]) => {
            setUniverse(uData.players);
            setUniverseMeta(uData.meta);
            setDeltaEntries(dData.entries ?? []);
        }).catch(() => {});
    }, []);

    const deltaMap = useMemo(
        () => new Map(deltaEntries.map(e => [e.name.toLowerCase(), e])),
        [deltaEntries],
    );

    // Build all players sorted by DTV (full universe, no cap)
    const allPlayers = useMemo(() => {
        if (!universe.length) return [];
        return universe.map((u, i) => {
            const p: Player = {
                rank:         i + 1,
                name:         u.name,
                position:     u.position,
                team:         u.team ?? 'FA',
                age:          u.age ?? 0,
                baseValue:    computePlayerBaseValue(u, u.position, { leagueType, superflex, ppr, leagueSize: 12, passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe }),
                injuryStatus: u.injuryStatus,
            };
            return p;
        });
    }, [universe, ppr, leagueType, leagueSettings, superflex]);

    // Global rank map: stable across position filters
    const dtvRankMap = useMemo(() => {
        const sorted = [...allPlayers].sort((a, b) => {
            const diff = calcDtv(b, ppr, leagueType, undefined, leagueSettings).finalDtv
                       - calcDtv(a, ppr, leagueType, undefined, leagueSettings).finalDtv;
            return diff !== 0 ? diff : a.name.localeCompare(b.name);
        });
        const map = new Map<string, number>();
        sorted.forEach((p, i) => map.set(p.name, i + 1));
        return map;
    }, [allPlayers, ppr, leagueType, leagueSettings]);

    const filteredPlayers = useMemo(() => {
        let list = allPlayers
            .filter(p => posFilter === 'ALL' || p.position === posFilter)
            .sort((a, b) => {
                const diff = calcDtv(b, ppr, leagueType, undefined, leagueSettings).finalDtv
                           - calcDtv(a, ppr, leagueType, undefined, leagueSettings).finalDtv;
                return diff !== 0 ? diff : a.name.localeCompare(b.name);
            });
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        return list;
    }, [allPlayers, posFilter, search, ppr, leagueType, leagueSettings]);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="font-bold">Player Rankings</h2>
                    <p className="text-gray-500 text-xs mt-0.5">
                        {leagueType === 'Dynasty'
                            ? 'Values adjust for age curve, position scarcity, and your league\'s scoring format.'
                            : 'Values adjust for position scarcity and your league\'s scoring format.'}
                        {universeMeta?.ktcSyncedAt && (
                            <span className="ml-2 text-gray-600">· Updated {timeAgo(universeMeta.ktcSyncedAt)}</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                        {POS_FILTER_OPTIONS.map(pos => (
                            <button key={pos} onClick={() => setPosFilter(pos)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${posFilter === pos ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
                                {pos}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder="Search…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-36"
                    />
                </div>
            </div>

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
                            const dtv    = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
                            const de     = deltaMap.get(p.name.toLowerCase());
                            const vol    = playerVolatility(de);
                            const dDelta = de?.dynasty.delta;
                            return (
                                <tr key={p.name} className="hover:bg-gray-800/30 transition">
                                    <td className="px-4 py-3 text-gray-600 text-xs">{dtvRankMap.get(p.name) ?? p.rank}</td>
                                    <td className="px-3 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-white font-medium">{p.name}</span>
                                            {vol === 'volatile' && <span className="text-[9px] font-bold px-1 py-px rounded bg-orange-900/40 text-orange-400 border border-orange-800/50 shrink-0">HOT</span>}
                                            {de?.isNew && <span className="text-[9px] font-bold px-1 py-px rounded bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 shrink-0">NEW</span>}
                                            {de?.team && <span className="text-[9px] font-bold px-1 py-px rounded bg-blue-900/30 text-blue-400 border border-blue-800/40 shrink-0" title={`Traded: ${de.team.prev ?? 'FA'} → ${de.team.current ?? 'FA'}`}>TRADED</span>}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[p.position] ?? ''}`}>
                                            {p.position}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-gray-400">{p.team}</td>
                                    <td className="px-3 py-3 text-right">
                                        {isIdpPosition(p.position) ? (
                                            <span className="text-gray-600 text-xs">—</span>
                                        ) : (
                                            <div className="flex items-center justify-end gap-1.5">
                                                <span className="font-bold text-white">{dtv.finalDtv}</span>
                                                {dDelta !== undefined && dDelta !== 0 && (
                                                    <span className={`text-[10px] font-bold ${dDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {dDelta > 0 ? `+${dDelta}` : dDelta}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className={`px-4 py-3 text-right font-semibold text-xs ${isIdpPosition(p.position) ? 'text-gray-600' : (TIER_COLORS[dtv.tier] ?? 'text-gray-400')}`}>
                                        {isIdpPosition(p.position) ? '—' : dtv.tier}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredPlayers.length === 0 && (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-600">No players match your filter.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
