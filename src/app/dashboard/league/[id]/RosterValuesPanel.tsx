'use client';

import { useState, useEffect } from 'react';
import type { RosterValuesResponse, RosterTeam, RosterPlayer, RosterTier } from '@/app/api/leagues/[leagueId]/roster-values/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const TIER_STYLES: Record<RosterTier, { label: string; badge: string; row: string }> = {
    Elite:       { label: 'Elite',       badge: 'bg-[#C8A951]/15 text-[#C8A951] border-[#C8A951]/40',           row: 'border-l-2 border-[#C8A951]/50' },
    Contender:   { label: 'Contender',   badge: 'bg-green-900/30 text-green-400 border-green-800/50',            row: 'border-l-2 border-green-700/50' },
    Competitive: { label: 'Competitive', badge: 'bg-blue-900/30 text-blue-400 border-blue-800/50',               row: 'border-l-2 border-blue-700/50' },
    Rebuilding:  { label: 'Rebuilding',  badge: 'bg-gray-800 text-gray-500 border-gray-700',                    row: 'border-l-2 border-gray-700/50' },
};

const POS_COLORS: Record<string, string> = {
    QB:   'bg-red-900/40 text-red-300 border-red-800',
    RB:   'bg-green-900/40 text-green-300 border-green-800',
    WR:   'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:   'bg-yellow-900/40 text-yellow-300 border-yellow-800',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlayerRow({ p }: { p: RosterPlayer }) {
    return (
        <tr className="hover:bg-gray-800/20 transition">
            <td className="pl-10 pr-3 py-2 text-white text-sm">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{p.name}</span>
                    {p.isNew     && <span className="text-[9px] font-bold px-1 py-px rounded bg-[#C8A951]/10 text-[#C8A951] border border-[#C8A951]/30">NEW</span>}
                    {p.isTraded  && <span className="text-[9px] font-bold px-1 py-px rounded bg-blue-900/30 text-blue-400 border border-blue-800/40">TRADED</span>}
                    {p.injuryStatus && p.injuryStatus !== 'Active' && (
                        <span className="text-[9px] font-bold px-1 py-px rounded bg-orange-900/30 text-orange-400 border border-orange-800/40">{p.injuryStatus.toUpperCase()}</span>
                    )}
                </div>
            </td>
            <td className="px-3 py-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[p.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                    {p.position}
                </span>
            </td>
            <td className="px-3 py-2 text-gray-400 text-sm">{p.team ?? '—'}</td>
            <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1.5">
                    <span className="font-bold text-white text-sm">{p.finalDtv}</span>
                    {p.delta !== null && p.delta !== 0 && (
                        <span className={`text-[10px] font-bold ${p.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {p.delta > 0 ? `+${p.delta}` : p.delta}
                        </span>
                    )}
                </div>
            </td>
        </tr>
    );
}

function TeamRow({
    team,
    expanded,
    onToggle,
}: {
    team:     RosterTeam;
    expanded: boolean;
    onToggle: () => void;
}) {
    const tier = TIER_STYLES[team.tier];
    const bd   = team.positionalBreakdown;

    return (
        <>
            <tr
                className={`hover:bg-gray-800/40 transition cursor-pointer ${tier.row}`}
                onClick={onToggle}
            >
                {/* Rank */}
                <td className="px-4 py-3.5 text-gray-500 font-bold text-sm w-10">{team.rank}</td>

                {/* Team name + expand chevron */}
                <td className="px-3 py-3.5 text-white font-semibold">
                    <div className="flex items-center gap-2">
                        <svg
                            className={`w-3.5 h-3.5 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="truncate">{team.displayName}</span>
                    </div>
                </td>

                {/* Total DTV */}
                <td className="px-3 py-3.5 text-right font-extrabold text-white text-base">{team.totalRosterValue}</td>

                {/* Tier badge */}
                <td className="px-3 py-3.5 text-right">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${tier.badge}`}>
                        {tier.label}
                    </span>
                </td>

                {/* Positional breakdown */}
                <td className="px-3 py-3.5 text-right text-sm text-gray-300">{bd.QB}</td>
                <td className="px-3 py-3.5 text-right text-sm text-gray-300">{bd.RB}</td>
                <td className="px-3 py-3.5 text-right text-sm text-gray-300">{bd.WR}</td>
                <td className="px-3 py-3.5 text-right text-sm text-gray-300">{bd.TE}</td>
                <td className="px-4 py-3.5 text-right text-sm text-gray-500">{bd.Bench}</td>
            </tr>

            {expanded && (
                <tr>
                    <td colSpan={9} className="px-0 py-0 bg-gray-900/60 border-b border-gray-800">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-800/60">
                                    <th className="pl-10 pr-3 py-2 text-left text-gray-600 text-xs font-medium">Player</th>
                                    <th className="px-3 py-2 text-left text-gray-600 text-xs font-medium">Pos</th>
                                    <th className="px-3 py-2 text-left text-gray-600 text-xs font-medium">Team</th>
                                    <th className="px-3 py-2 text-right text-gray-600 text-xs font-medium">DTV</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/30">
                                {team.players.map(p => <PlayerRow key={p.playerId} p={p} />)}
                            </tbody>
                        </table>
                    </td>
                </tr>
            )}
        </>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RosterValuesPanel({ sleeperLeagueId }: { sleeperLeagueId: string }) {
    const [data,     setData]     = useState<RosterValuesResponse | null>(null);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    useEffect(() => {
        fetch(`/api/leagues/${sleeperLeagueId}/roster-values`)
            .then(r => {
                if (!r.ok) throw new Error(`${r.status}`);
                return r.json() as Promise<RosterValuesResponse>;
            })
            .then(d => { setData(d); setLoading(false); })
            .catch(e => { setError(String(e)); setLoading(false); });
    }, [sleeperLeagueId]);

    const toggle = (rosterId: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(rosterId) ? next.delete(rosterId) : next.add(rosterId);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 flex flex-col items-center gap-3">
                <div className="w-7 h-7 border-2 border-[#C8A951] border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Computing roster values…</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <p className="text-red-400 text-sm">Failed to load roster values.</p>
                <p className="text-gray-600 text-xs mt-1">{error}</p>
            </div>
        );
    }

    const { meta, teams } = data;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800">
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="font-bold text-lg">Roster Values</h2>
                        <p className="text-gray-500 text-xs mt-0.5">
                            Team DTV grades for {meta.leagueName} · {meta.leagueType} · {meta.scoringType?.toUpperCase() ?? 'STD'}
                            {meta.superflex ? ' · Superflex' : ''}
                            {' · '}{meta.teamCount} teams
                        </p>
                    </div>
                    {/* Tier legend */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {(Object.entries(TIER_STYLES) as [RosterTier, typeof TIER_STYLES[RosterTier]][]).map(([key, s]) => (
                            <span key={key} className={`text-xs font-semibold px-2 py-0.5 rounded-lg border ${s.badge}`}>{s.label}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                    <thead>
                        <tr className="border-b border-gray-800">
                            <th className="text-left px-4 py-3 text-gray-500 font-medium w-10">#</th>
                            <th className="text-left px-3 py-3 text-gray-500 font-medium">Team</th>
                            <th className="text-right px-3 py-3 text-gray-500 font-medium">Total DTV</th>
                            <th className="text-right px-3 py-3 text-gray-500 font-medium">Tier</th>
                            <th className="text-right px-3 py-3 text-gray-500 font-medium">QB</th>
                            <th className="text-right px-3 py-3 text-gray-500 font-medium">RB</th>
                            <th className="text-right px-3 py-3 text-gray-500 font-medium">WR</th>
                            <th className="text-right px-3 py-3 text-gray-500 font-medium">TE</th>
                            <th className="text-right px-4 py-3 text-gray-500 font-medium">Bench</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {teams.map(team => (
                            <TeamRow
                                key={team.rosterId}
                                team={team}
                                expanded={expanded.has(team.rosterId)}
                                onToggle={() => toggle(team.rosterId)}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer — tier bands come from the API so they always match the model */}
            <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-between flex-wrap gap-2">
                <p className="text-gray-600 text-xs">
                    {(Object.entries(meta.tierBands) as [string, string][])
                        .map(([tier, band]) => `${tier}: ${band}`)
                        .join(' · ')}
                </p>
                <p className="text-gray-700 text-xs">
                    Generated {new Date(meta.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
            </div>
        </div>
    );
}
