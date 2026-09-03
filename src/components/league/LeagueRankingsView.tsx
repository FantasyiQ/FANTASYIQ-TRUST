'use client';

import { useState, useMemo } from 'react';
import type { LeagueRankingsData, PlayerRankingRow, TeamRankingRow, PowerRankingRow } from '@/lib/league/getLeagueRankings';
import { normalizePosition } from '@/lib/draft/context';

type Tab = 'players' | 'teams' | 'power';

const TIER_COLORS: Record<string, string> = {
    Elite:   'text-[#D4AF37]',
    Star:    'text-green-400',
    Starter: 'text-blue-400',
    Flex:    'text-gray-300',
    Bench:   'text-orange-400',
    Waiver:  'text-red-400',
};

const ROSTER_TIER_COLORS: Record<string, string> = {
    Elite:       'text-[#D4AF37]',
    Contender:   'text-green-400',
    Competitive: 'text-blue-400',
    Rebuilding:  'text-gray-500',
};

const POS_COLORS: Record<string, string> = {
    QB:  'bg-red-900/40 text-red-300 border-red-800',
    RB:  'bg-green-900/40 text-green-300 border-green-800',
    WR:  'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:  'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    K:   'bg-gray-800 text-gray-400 border-gray-700',
    IDP: 'bg-purple-900/40 text-purple-300 border-purple-700/60',
};

// Filter chips only ever show groups this league actually rosters (see
// availablePositions below) — a league with no K/DEF/IDP slots shouldn't
// offer filters that always return nothing. Individual defensive positions
// (DL/LB/DB/etc.) group under one IDP chip, same as the Live Draft
// Assistant's Available Players list (normalizePosition), so a player row
// still shows their real position badge (DL/LB/DB) — only the filter groups.
const POS_FILTER_OPTIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'IDP'];

function formatAge(age: number | null, preciseAge: number | null): string {
    if (preciseAge != null) return preciseAge.toFixed(1);
    return age != null ? String(age) : '—';
}

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return 'unknown';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1)  return 'just now';
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

// ── Sub-tables ────────────────────────────────────────────────────────────────

function PlayerRankingsTable({
    rankings,
    search,
    position,
    onSearch,
    onPosition,
    valueSyncedAt,
    leagueType,
}: {
    rankings:    PlayerRankingRow[];
    search:      string;
    position:    string;
    onSearch:    (v: string) => void;
    onPosition:  (v: string) => void;
    valueSyncedAt: string | null;
    leagueType:  string;
}) {
    // Only offer filter chips for position groups this league's rankings
    // actually contain — a league with no K/DEF/IDP roster slots shouldn't
    // show filters that always return an empty list.
    const availablePositions = useMemo(() => {
        const present = new Set(rankings.map(p => normalizePosition(p.position)));
        return POS_FILTER_OPTIONS.filter(pos => pos === 'All' || present.has(pos));
    }, [rankings]);

    const filtered = useMemo(() => {
        let list = rankings;
        if (position !== 'All') list = list.filter(p => normalizePosition(p.position) === position);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        return list;
    }, [rankings, position, search]);

    return (
        <div>
            <div className="px-6 py-3 border-b border-gray-800">
                {valueSyncedAt && (
                    <p className="text-gray-500 text-xs mb-2">
                        {leagueType === 'Dynasty'
                            ? 'Values adjust for age curve, position scarcity, and your league\'s scoring format.'
                            : 'Values adjust for position scarcity and your league\'s scoring format.'}
                        <span className="ml-2 text-gray-600">· Updated {timeAgo(valueSyncedAt)}</span>
                    </p>
                )}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-2 flex-wrap">
                    {availablePositions.map(pos => (
                        <button key={pos} onClick={() => onPosition(pos)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${position === pos ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
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
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-500 text-left border-b border-gray-800">
                            <th className="px-4 py-3 font-medium w-10">#</th>
                            <th className="px-3 py-3 font-medium">Player</th>
                            <th className="px-3 py-3 font-medium">Pos</th>
                            <th className="px-3 py-3 font-medium">Team</th>
                            <th className="px-3 py-3 font-medium text-right">Age</th>
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
                                <td className="px-3 py-2.5 text-right text-gray-400 whitespace-nowrap">{formatAge(p.age, p.preciseAge)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-white">{p.finalDtv}</td>
                                <td className={`px-4 py-2.5 text-right font-semibold text-xs ${TIER_COLORS[p.tier] ?? 'text-gray-400'}`}>{p.tier}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-600">No players match your filter.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function TeamRankingsTable({ rankings, valueLabel = 'Total DTV' }: { rankings: TeamRankingRow[]; valueLabel?: string }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-gray-500 text-left border-b border-gray-800">
                        <th className="px-4 py-3 font-medium w-10">#</th>
                        <th className="px-3 py-3 font-medium">Owner</th>
                        <th className="px-3 py-3 font-medium">Top Player</th>
                        <th className="px-3 py-3 font-medium text-right">Players</th>
                        <th className="px-3 py-3 font-medium text-right">{valueLabel}</th>
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

export function PowerRankingsTable({ rankings, preseason, lastSeasonRankings }: { rankings: PowerRankingRow[]; preseason: boolean; lastSeasonRankings: boolean }) {
    return (
        <div className="overflow-x-auto">
            {lastSeasonRankings && (
                <div className="px-6 py-2 border-b border-gray-800 text-xs text-gray-500">
                    Pre-season — showing last season&apos;s final power rankings &middot; Scores are based on win/loss record, points for, and strength of schedule
                </div>
            )}
            {preseason && !lastSeasonRankings && (
                <div className="px-6 py-2 border-b border-gray-800 text-xs text-gray-600">
                    Pre-season — scores are based on win/loss record, points for, and strength of schedule
                </div>
            )}
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-gray-500 text-left border-b border-gray-800">
                        <th className="px-4 py-3 font-medium w-10">#</th>
                        <th className="px-3 py-3 font-medium">Owner</th>
                        <th className="px-3 py-3 font-medium text-right">W-L</th>
                        <th className="px-3 py-3 font-medium text-right">PF</th>
                        <th className="px-3 py-3 font-medium text-right">PA</th>
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
                            <td className="px-3 py-2.5 text-right text-gray-300">{r.wins}–{r.losses}</td>
                            <td className="px-3 py-2.5 text-right text-gray-400">{(r.pf ?? 0).toFixed(1)}</td>
                            <td className="px-3 py-2.5 text-right text-gray-500">{(r.pa ?? 0).toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-white">{r.powerScore}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── LeagueRankingsView — named export, state passed as props ──────────────────

export function LeagueRankingsView({
    league,
    playerRankings,
    teamRankings,
    powerRankings,
    valueSyncedAt,
    lastSeasonRankings,
    preseason,
    search,
    position,
    onSearch,
    onPosition,
}: LeagueRankingsData & {
    preseason:  boolean;
    search:     string;
    position:   string;
    onSearch:   (v: string) => void;
    onPosition: (v: string) => void;
}) {
    const [tab, setTab] = useState<Tab>('players');

    const tabs = [
        { key: 'players' as Tab, label: 'Players' },
        { key: 'teams'   as Tab, label: 'Teams' },
        { key: 'power'   as Tab, label: 'Power' },
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
                                    ? 'font-semibold text-[#D4AF37] border-b-2 border-[#D4AF37] pb-1 text-sm transition'
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
                    rankings={playerRankings}
                    search={search}
                    position={position}
                    onSearch={onSearch}
                    onPosition={onPosition}
                    valueSyncedAt={valueSyncedAt}
                    leagueType={league.leagueType}
                />
            )}
            {tab === 'teams' && (
                <TeamRankingsTable rankings={teamRankings} />
            )}
            {tab === 'power' && (
                <PowerRankingsTable rankings={powerRankings} preseason={preseason} lastSeasonRankings={lastSeasonRankings} />
            )}
        </div>
    );
}

// ── Default export — owns search/position state, rendered by the page ─────────

export default function LeagueRankingsClient(props: LeagueRankingsData) {
    const [search,   setSearch]   = useState('');
    const [position, setPosition] = useState('All');

    const preseason = props.powerRankings.every(r => r.wins === 0 && r.losses === 0);

    return (
        <LeagueRankingsView
            {...props}
            preseason={preseason}
            search={search}
            position={position}
            onSearch={setSearch}
            onPosition={setPosition}
        />
    );
}
