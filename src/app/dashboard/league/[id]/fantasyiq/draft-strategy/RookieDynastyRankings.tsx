'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { rookieTierBadgeClass, rookieTierLabel, ROOKIE_TIER_BANDS } from '@/lib/dynasty/rookieRankings';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
    id:          string;
    playerName:  string;
    school:      string;
    position:    string;
    nflGrade:    number;
    fiqGrade:    number;
    eliteScore:  number;
    marketScore: number;
    overallPick: number;
    draftCap:    number;
    fiqScore:    number;
    fiqTier:     string;
    playerId:    string | null;
    team:        string | null;
    height:      string | null;
    weight:      number | null;
    age:         number | null;
}

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K'] as const;
const TIERS     = ['All Tiers', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'] as const;

const POS_COLORS: Record<string, string> = {
    QB:  'bg-red-900/40 text-red-300 border-red-700/60',
    RB:  'bg-blue-900/40 text-blue-300 border-blue-700/60',
    WR:  'bg-green-900/40 text-green-300 border-green-700/60',
    TE:  'bg-orange-900/40 text-orange-300 border-orange-700/60',
    K:   'bg-gray-800 text-gray-400 border-gray-700',
    DEF: 'bg-gray-800 text-gray-400 border-gray-700',
};

// ── Tier summary bar ─────────────────────────────────────────────────────────

function TierSummary({ players }: { players: Player[] }) {
    const counts = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'].map(t => ({
        tier:  t,
        count: players.filter(p => p.fiqTier === t).length,
    })).filter(x => x.count > 0);

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {counts.map(({ tier, count }) => (
                <span
                    key={tier}
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${rookieTierBadgeClass(tier)}`}
                >
                    {rookieTierLabel(tier)}
                    <span className="opacity-60">·</span>
                    {count}
                </span>
            ))}
        </div>
    );
}

// ── Player avatar ─────────────────────────────────────────────────────────────

function PlayerAvatar({ playerId, name }: { playerId: string | null; name: string }) {
    const [errored, setErrored] = useState(false);

    if (!playerId || errored) {
        return (
            <div className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                <span className="text-gray-600 text-[10px] font-bold">
                    {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
            </div>
        );
    }

    return (
        <div className="w-9 h-9 rounded-full overflow-hidden border border-gray-700 shrink-0 bg-gray-800">
            <Image
                src={`https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`}
                alt={name}
                width={36}
                height={36}
                className="w-full h-full object-cover object-top"
                onError={() => setErrored(true)}
                unoptimized
            />
        </div>
    );
}

// ── Player row ───────────────────────────────────────────────────────────────

function PlayerRow({ player, rank }: { player: Player; rank: number }) {
    const posClass = POS_COLORS[player.position] ?? 'bg-gray-800 text-gray-400 border-gray-700';

    return (
        <tr className="border-b border-gray-800/60 hover:bg-gray-800/30 transition group">
            {/* Rank */}
            <td className="px-4 py-3 text-gray-500 text-xs tabular-nums w-8 text-right">
                {rank}
            </td>

            {/* Player */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                    <PlayerAvatar playerId={player.playerId} name={player.playerName} />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 ${posClass}`}>
                                {player.position}
                            </span>
                            <span className="text-white text-sm font-medium">{player.playerName}</span>
                            {player.team && (
                                <span className="text-[#D4AF37] text-[10px] font-bold">{player.team}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-gray-600 text-[10px]">{player.school}</span>
                            {(player.height || player.weight || player.age) && (
                                <span className="text-gray-700 text-[10px]">·</span>
                            )}
                            {player.height && (
                                <span className="text-gray-600 text-[10px]">{player.height}</span>
                            )}
                            {player.weight && (
                                <span className="text-gray-600 text-[10px]">{player.weight} lbs</span>
                            )}
                            {player.age && (
                                <span className="text-gray-600 text-[10px]">Age {player.age}</span>
                            )}
                        </div>
                    </div>
                </div>
            </td>

            {/* FiQ Score */}
            <td className="px-4 py-3 text-right">
                <span className="text-white font-bold tabular-nums text-sm">
                    {player.fiqScore.toFixed(1)}
                </span>
            </td>

            {/* Tier */}
            <td className="px-4 py-3 text-right">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${rookieTierBadgeClass(player.fiqTier)}`}>
                    {rookieTierLabel(player.fiqTier)}
                </span>
            </td>

            {/* Draft Pick */}
            <td className="px-4 py-3 text-right text-gray-500 tabular-nums text-xs hidden sm:table-cell">
                {player.overallPick >= 261 ? 'UDFA' : `#${player.overallPick}`}
            </td>
        </tr>
    );
}

// ── Tier legend ───────────────────────────────────────────────────────────────

function TierLegend() {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
            <p className="text-[10px] font-bold tracking-widest text-gray-500">FiQ Score Tier Guide</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {ROOKIE_TIER_BANDS.map(band => (
                    <div key={band.tier} className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${rookieTierBadgeClass(band.tier)}`}>
                                {rookieTierLabel(band.tier)}
                            </span>
                            <span className="text-white text-xs font-semibold">{band.label}</span>
                        </div>
                        <p className="text-gray-300 text-[10px] leading-relaxed">{band.description}</p>
                        <p className="text-gray-400 text-[9px]">
                            FiQ {band.max === Infinity ? `≥ ${band.min}` : `${band.min}–${band.max}`}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RookieDynastyRankings({
    players,
    season,
}: {
    players: Player[];
    season:  string;
}) {
    const [posFilter,  setPosFilter]  = useState<string>('All');
    const [tierFilter, setTierFilter] = useState<string>('All Tiers');
    const [search,     setSearch]     = useState('');

    const filtered = useMemo(() => {
        let list = players;
        if (posFilter  !== 'All')       list = list.filter(p => p.position === posFilter);
        if (tierFilter !== 'All Tiers') list = list.filter(p => p.fiqTier  === tierFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                p.playerName.toLowerCase().includes(q) ||
                p.school.toLowerCase().includes(q)     ||
                (p.team ?? '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [players, posFilter, tierFilter, search]);

    // Positions that actually have data
    const availablePositions = useMemo(() => {
        const present = new Set(players.map(p => p.position));
        return POSITIONS.filter(pos => pos === 'All' || present.has(pos));
    }, [players]);

    return (
        <div className="space-y-4">

            {/* Header card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                            Dynasty Rookie Rankings
                        </p>
                        <p className="text-white font-bold mt-0.5">
                            FiQ Score: NFL Scouting Grades, Player Profile, Athleticism, Production &amp; Draft Capital
                        </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-2.5 py-1 rounded-full">
                        {season}
                    </span>
                </div>
                <TierSummary players={players} />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">

                {/* Position tabs */}
                <div className="flex gap-1 flex-wrap">
                    {availablePositions.map(pos => (
                        <button
                            key={pos}
                            type="button"
                            onClick={() => setPosFilter(pos)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border
                                ${posFilter === pos
                                    ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                    : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}
                        >
                            {pos}
                        </button>
                    ))}
                </div>

                {/* Tier filter */}
                <div className="flex gap-1 flex-wrap">
                    {TIERS.map(t => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTierFilter(t)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border
                                ${tierFilter === t
                                    ? 'bg-gray-700 text-white border-gray-500'
                                    : 'bg-gray-800/50 text-gray-600 border-gray-700/50 hover:border-gray-600'}`}
                        >
                            {t === 'All Tiers' ? t : rookieTierLabel(t)}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <input
                    type="text"
                    placeholder="Search player…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-gray-800 border border-gray-700 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-40"
                />
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-1">
                    <p className="text-gray-400 font-semibold text-sm">No players found</p>
                    <p className="text-gray-600 text-xs">Try adjusting your filters.</p>
                </div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-800 text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                                <th className="px-4 py-3 text-right w-8">#</th>
                                <th className="px-4 py-3">Player</th>
                                <th className="px-4 py-3 text-right normal-case">FiQ Score</th>
                                <th className="px-4 py-3 text-right">Tier</th>
                                <th className="px-4 py-3 text-right hidden sm:table-cell">Pick</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((player, i) => (
                                <PlayerRow key={player.id} player={player} rank={i + 1} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Tier legend */}
            <TierLegend />

        </div>
    );
}
