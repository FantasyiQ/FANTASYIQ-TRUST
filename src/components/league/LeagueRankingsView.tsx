'use client';

import { useState, useMemo } from 'react';
import type { LeagueRankingsData, PlayerRankingRow, TeamRankingRow, PowerRankingRow } from '@/lib/league/getLeagueRankings';

type Tab = 'players' | 'teams' | 'power';

const TIER_COLORS: Record<string, string> = {
    Elite:   'text-[#C8A951]',
    Star:    'text-green-400',
    Starter: 'text-blue-400',
    Flex:    'text-gray-300',
    Bench:   'text-orange-400',
    Waiver:  'text-red-400',
};

const ROSTER_TIER_COLORS: Record<string, string> = {
    Elite:       'text-[#C8A951]',
    Contender:   'text-green-400',
    Competitive: 'text-blue-400',
    Rebuilding:  'text-gray-500',
};

const POS_COLORS: Record<string, string> = {
    QB: 'bg-red-900/40 text-red-300 border-red-800',
    RB: 'bg-green-900/40 text-green-300 border-green-800',
    WR: 'bg-blue-900/40 text-blue-300 border-blue-800',
    TE: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
};

const POS_FILTER_OPTIONS = ['All', 'QB', 'RB', 'WR', 'TE'];

// ── Sub-tables ────────────────────────────────────────────────────────────────

function PlayerRankingsTable({
    rankings,
    search,
    position,
    onSearch,
    onPosition,
}: {
    rankings:   PlayerRankingRow[];
    search:     string;
    position:   string;
    onSearch:   (v: string) => void;
    onPosition: (v: string) => void;
}) {
    const filtered = useMemo(() => {
        let list = rankings;
        if (position !== 'All') list = list.filter(p => p.position === position);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        return list.slice(0, 100);
    }, [rankings, position, search]);

    return (
        <div>
            <div className="px-6 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-2 flex-wrap">
                    {POS_FILTER_OPTIONS.map(pos => (
                        <button key={pos} onClick={() => onPosition(pos)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${position === pos ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
                            {pos}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search players…"
                    value={search}
                    onChange={e => onSearch(e.target.value)}
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
                        {filtered.map((p, i) => (
                            <tr key={p.name} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
                                <td className="px-4 py-2.5 text-gray-600 text-xs">{i + 1}</td>
                                <td className="px-3 py-2.5 text-white font-medium">
                                    {p.name}
                                    {p.injuryStatus && p.injuryStatus !== 'Active' && (
                                        <span className="ml-1.5 text-xs text-red-400">({p.injuryStatus})</span>
                                    )}
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${POS_COLORS[p.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                        {p.position}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-400">{p.team ?? 'FA'}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-white">{p.finalDtv}</td>
                                <td className={`px-4 py-2.5 text-right font-semibold text-xs ${TIER_COLORS[p.tier] ?? 'text-gray-400'}`}>{p.tier}</td>
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

function TeamRankingsTable({ rankings }: { rankings: TeamRankingRow[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-gray-500 text-left border-b border-gray-800">
                        <th className="px-4 py-3 font-medium w-10">#</th>
                        <th className="px-3 py-3 font-medium">Owner</th>
                        <th className="px-3 py-3 font-medium">Top Player</th>
                        <th className="px-3 py-3 font-medium text-right">Players</th>
                        <th className="px-3 py-3 font-medium text-right">Total DTV</th>
                        <th className="px-4 py-3 font-medium text-right">Tier</th>
                    </tr>
                </thead>
                <tbody>
                    {rankings.map(t => (
                        <tr key={t.rosterId} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
                            <td className="px-4 py-2.5 text-gray-600 text-xs">{t.rank}</td>
                            <td className="px-3 py-2.5">
                                <div className="text-white font-medium">{t.ownerName}</div>
                                <div className="text-gray-600 text-xs">{t.teamName}</div>
                            </td>
                            <td className="px-3 py-2.5">
                                {t.topPlayer ? (
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${POS_COLORS[t.topPlayer.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                            {t.topPlayer.position}
                                        </span>
                                        <span className="text-gray-300">{t.topPlayer.name}</span>
                                        <span className="text-gray-600 text-xs">({t.topPlayer.finalDtv})</span>
                                    </div>
                                ) : (
                                    <span className="text-gray-600">—</span>
                                )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-400">{t.playerCount}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-white">{t.totalDtv}</td>
                            <td className={`px-4 py-2.5 text-right font-semibold text-xs ${ROSTER_TIER_COLORS[t.tier] ?? 'text-gray-400'}`}>{t.tier}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function PowerRankingsTable({ rankings, preseason }: { rankings: PowerRankingRow[]; preseason: boolean }) {
    return (
        <div className="overflow-x-auto">
            {preseason && (
                <div className="px-6 py-2 border-b border-gray-800 text-xs text-gray-600">
                    Pre-season — power scores based on roster DTV only.
                </div>
            )}
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-gray-500 text-left border-b border-gray-800">
                        <th className="px-4 py-3 font-medium w-10">#</th>
                        <th className="px-3 py-3 font-medium">Owner</th>
                        {!preseason && <th className="px-3 py-3 font-medium text-right">W-L</th>}
                        {!preseason && <th className="px-3 py-3 font-medium text-right">PF</th>}
                        <th className="px-3 py-3 font-medium text-right">Roster DTV</th>
                        <th className="px-4 py-3 font-medium text-right">Power Score</th>
                    </tr>
                </thead>
                <tbody>
                    {rankings.map(r => (
                        <tr key={r.rosterId} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
                            <td className="px-4 py-2.5 text-gray-600 text-xs">{r.rank}</td>
                            <td className="px-3 py-2.5">
                                <div className="text-white font-medium">{r.ownerName}</div>
                                <div className="text-gray-600 text-xs">{r.teamName}</div>
                            </td>
                            {!preseason && <td className="px-3 py-2.5 text-right text-gray-300">{r.wins}–{r.losses}</td>}
                            {!preseason && <td className="px-3 py-2.5 text-right text-gray-400">{r.pf.toFixed(1)}</td>}
                            <td className="px-3 py-2.5 text-right text-gray-300">{r.rosterDtv}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-white">{r.powerScore}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── LeagueRankingsView — named export, state passed as props ──────────────────

export function LeagueRankingsView(props: LeagueRankingsData & {
    search:     string;
    position:   string;
    onSearch:   (v: string) => void;
    onPosition: (v: string) => void;
}) {
    const [tab, setTab] = useState<Tab>('players');

    const isPreseason = props.powerRankings.every(r => r.wins === 0 && r.losses === 0);

    const tabs: { key: Tab; label: string }[] = [
        { key: 'players', label: 'Players' },
        { key: 'teams',   label: 'Teams' },
        { key: 'power',   label: 'Power' },
    ];

    return (
        <div>
            <h2 className="text-xl font-semibold mb-4">Rankings</h2>

            <div className="flex gap-4 border-b border-gray-800 pb-2 mb-4">
                {tabs.map(t => {
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={
                                active
                                    ? 'font-semibold text-[#C8A951] border-b-2 border-[#C8A951] pb-1 text-sm transition'
                                    : 'text-gray-500 hover:text-white text-sm transition pb-1'
                            }
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === 'players' && (
                <PlayerRankingsTable
                    rankings={props.playerRankings}
                    search={props.search}
                    position={props.position}
                    onSearch={props.onSearch}
                    onPosition={props.onPosition}
                />
            )}
            {tab === 'teams' && (
                <TeamRankingsTable rankings={props.teamRankings} />
            )}
            {tab === 'power' && (
                <PowerRankingsTable rankings={props.powerRankings} preseason={isPreseason} />
            )}
        </div>
    );
}

// ── Default export — owns search/position state, rendered by the page ─────────

export default function LeagueRankingsClient(props: LeagueRankingsData) {
    const [search,   setSearch]   = useState('');
    const [position, setPosition] = useState('All');

    return (
        <LeagueRankingsView
            {...props}
            search={search}
            position={position}
            onSearch={setSearch}
            onPosition={setPosition}
        />
    );
}
