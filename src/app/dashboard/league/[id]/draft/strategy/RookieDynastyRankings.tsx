'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { rookieTierBadgeClass, rookieTierLabel, ROOKIE_TIER_BANDS } from '@/lib/dynasty/rookieRankings';
import type { LeaguePhaseResult } from '@/lib/leaguePhase';
import { phaseLabel } from '@/lib/leaguePhase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
    id:              string;
    playerName:      string;
    school:          string;
    position:        string;
    nflGrade:        number;
    fiqGrade:        number;
    eliteScore:      number;
    marketScore:     number;
    overallPick:     number;
    draftCap:        number;
    baseFiQScore:    number;
    opportunityScore: number;
    fiqScore:        number;
    fiqTier:         string;
    playerId:        string | null;
    team:            string | null;
    height:          string | null;
    weight:          number | null;
    age:             number | null;
    fortyTime:       number | null;
}

const SKILL_POSITIONS   = ['All', 'QB', 'RB', 'WR', 'TE', 'K'] as const;
const IDP_POSITIONS     = ['DL', 'LB', 'DB'] as const;
const TIERS             = ['All Tiers', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'] as const;

// Maps specific IDP positions → display group for filtering
const IDP_GROUP: Record<string, string> = {
    DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', EDGE: 'DL',
    OLB: 'LB', ILB: 'LB', MLB: 'LB', LB: 'LB',
    CB: 'DB', FS: 'DB', SS: 'DB', NB: 'DB', S: 'DB', DB: 'DB', SAF: 'DB',
};

const POS_COLORS: Record<string, string> = {
    QB:  'bg-red-900/40 text-red-300 border-red-700/60',
    RB:  'bg-blue-900/40 text-blue-300 border-blue-700/60',
    WR:  'bg-green-900/40 text-green-300 border-green-700/60',
    TE:  'bg-orange-900/40 text-orange-300 border-orange-700/60',
    K:   'bg-gray-800 text-gray-400 border-gray-700',
    // IDP
    DE:  'bg-rose-900/40 text-rose-300 border-rose-700/60',
    DT:  'bg-rose-900/40 text-rose-300 border-rose-700/60',
    NT:  'bg-rose-900/40 text-rose-300 border-rose-700/60',
    DL:  'bg-rose-900/40 text-rose-300 border-rose-700/60',
    OLB: 'bg-purple-900/40 text-purple-300 border-purple-700/60',
    ILB: 'bg-purple-900/40 text-purple-300 border-purple-700/60',
    MLB: 'bg-purple-900/40 text-purple-300 border-purple-700/60',
    LB:  'bg-purple-900/40 text-purple-300 border-purple-700/60',
    CB:  'bg-teal-900/40 text-teal-300 border-teal-700/60',
    FS:  'bg-teal-900/40 text-teal-300 border-teal-700/60',
    SS:  'bg-teal-900/40 text-teal-300 border-teal-700/60',
    NB:  'bg-teal-900/40 text-teal-300 border-teal-700/60',
    S:   'bg-teal-900/40 text-teal-300 border-teal-700/60',
    DB:  'bg-teal-900/40 text-teal-300 border-teal-700/60',
    SAF: 'bg-teal-900/40 text-teal-300 border-teal-700/60',
    P:   'bg-gray-800 text-gray-400 border-gray-700',
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

// ── Team logo ─────────────────────────────────────────────────────────────────

function TeamLogo({ team }: { team: string }) {
    const [errored, setErrored] = useState(false);
    if (errored) return null;
    return (
        <Image
            src={`https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.jpg`}
            alt={team}
            width={20}
            height={20}
            className="w-full h-full object-contain"
            onError={() => setErrored(true)}
            unoptimized
        />
    );
}

// ── Draft badge ───────────────────────────────────────────────────────────────

function DraftBadge({ pick }: { pick: number }) {
    if (pick >= 261) {
        return (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-gray-800/60 text-gray-600 border-gray-700/50">
                UDFA
            </span>
        );
    }
    const round = pick <= 32 ? 1 : pick <= 64 ? 2 : pick <= 96 ? 3 : pick <= 128 ? 4 : pick <= 165 ? 5 : pick <= 215 ? 6 : 7;
    const style =
        round === 1 ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/40' :
        round === 2 ? 'bg-slate-700/30 text-slate-300 border-slate-500/40' :
        round === 3 ? 'bg-amber-900/20 text-amber-500/80 border-amber-700/30' :
                     'bg-gray-800/60 text-gray-500 border-gray-700/50';
    return (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${style}`}>
            Rd {round} · #{pick}
        </span>
    );
}

// ── Player avatar ─────────────────────────────────────────────────────────────

function PlayerAvatar({ playerId, name, team }: { playerId: string | null; name: string; team: string | null }) {
    const [errored, setErrored] = useState(false);

    return (
        <div className="relative shrink-0">
            {/* Headshot */}
            {!playerId || errored ? (
                <div className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                    <span className="text-gray-600 text-[10px] font-bold">
                        {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                </div>
            ) : (
                <div className="w-9 h-9 rounded-full overflow-hidden border border-gray-700 bg-gray-800">
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
            )}
            {/* Team logo overlay */}
            {team && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center overflow-hidden">
                    <TeamLogo team={team} />
                </div>
            )}
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
                    <PlayerAvatar playerId={player.playerId} name={player.playerName} team={player.team} />
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
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-gray-600 text-[10px]">{player.school}</span>
                            <span className="text-gray-700 text-[10px]">·</span>
                            <DraftBadge pick={player.overallPick} />
                            {(player.height || player.weight || player.age || player.fortyTime) && (
                                <span className="text-gray-700 text-[10px]">·</span>
                            )}
                            {player.height && (
                                <span className="text-gray-600 text-[10px]">{player.height}</span>
                            )}
                            {player.weight && (
                                <span className="text-gray-600 text-[10px]">{player.weight} lbs</span>
                            )}
                            {player.fortyTime && (
                                <span className="text-gray-600 text-[10px]">{player.fortyTime}</span>
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
    hasIDP = false,
    phaseResult,
}: {
    players:      Player[];
    season:       string;
    hasIDP?:      boolean;
    phaseResult?: LeaguePhaseResult;
}) {
    const [posFilter,  setPosFilter]  = useState<string>('All');
    const [tierFilter, setTierFilter] = useState<string>('All Tiers');
    const [search,     setSearch]     = useState('');

    const filtered = useMemo(() => {
        let list = players;
        if (posFilter !== 'All') {
            // IDP group filter (DL/LB/DB) matches specific positions via IDP_GROUP
            const isIdpGroup = IDP_POSITIONS.includes(posFilter as typeof IDP_POSITIONS[number]);
            list = list.filter(p =>
                isIdpGroup
                    ? IDP_GROUP[p.position] === posFilter
                    : p.position === posFilter
            );
        }
        if (tierFilter !== 'All Tiers') list = list.filter(p => p.fiqTier === tierFilter);
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

    // Build position tabs — skill positions always shown, IDP only if league uses it
    const availablePositions = useMemo(() => {
        const present = new Set(players.map(p => p.position));
        const presentIdpGroups = new Set(
            players.map(p => IDP_GROUP[p.position]).filter(Boolean)
        );
        const skill = SKILL_POSITIONS.filter(pos => pos === 'All' || present.has(pos));
        const idp   = hasIDP ? IDP_POSITIONS.filter(g => presentIdpGroups.has(g)) : [];
        return [...skill, ...idp];
    }, [players, hasIDP]);

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
                            {season} Rookie Class
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                            FiQ Score: NFL Scouting Grades · Draft Capital · Opportunity · Market Value
                        </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <span className="text-[10px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-2.5 py-1 rounded-full">
                            {season}
                        </span>
                        {phaseResult && (
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                phaseResult.phase === 'PRE_DRAFT'      ? 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50' :
                                phaseResult.phase === 'OFFSEASON'      ? 'bg-gray-800 text-gray-400 border-gray-700' :
                                phaseResult.phase === 'REGULAR_SEASON' ? 'bg-green-900/30 text-green-400 border-green-700/50' :
                                phaseResult.phase === 'PLAYOFFS'       ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/40' :
                                                                          'bg-red-900/20 text-red-400 border-red-700/40'
                            }`}>
                                {phaseLabel(phaseResult.phase)}
                            </span>
                        )}
                    </div>
                </div>
                <TierSummary players={players} />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-1">

                {/* Position tabs — single row, no wrap */}
                <div className="flex gap-1 items-center shrink-0">
                    {availablePositions.map((pos, i) => {
                        const isIdpGroup = IDP_POSITIONS.includes(pos as typeof IDP_POSITIONS[number]);
                        const prevPos    = availablePositions[i - 1];
                        const showDivider = isIdpGroup && prevPos && !IDP_POSITIONS.includes(prevPos as typeof IDP_POSITIONS[number]);
                        return (
                            <span key={pos} className="flex items-center gap-1">
                                {showDivider && (
                                    <span className="w-px h-4 bg-gray-700 mx-0.5 shrink-0" />
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPosFilter(pos)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border whitespace-nowrap
                                        ${posFilter === pos
                                            ? isIdpGroup
                                                ? 'bg-rose-700/80 text-white border-rose-600'
                                                : 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                            : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}
                                >
                                    {pos}
                                </button>
                            </span>
                        );
                    })}
                </div>

                {/* Search — grows to fill remaining space */}
                <input
                    type="text"
                    placeholder="Search players…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg text-sm bg-gray-800 border border-gray-700 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />

                {/* Tier dropdown — far right */}
                <div className="shrink-0">
                    <select
                        value={tierFilter}
                        onChange={e => setTierFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 border border-gray-700 text-gray-300 focus:outline-none focus:border-gray-500 cursor-pointer"
                    >
                        {TIERS.map(t => (
                            <option key={t} value={t}>
                                {t === 'All Tiers' ? 'All Tiers' : rookieTierLabel(t)}
                            </option>
                        ))}
                    </select>
                </div>
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
