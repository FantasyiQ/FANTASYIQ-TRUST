'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { SlimPlayer } from '@/lib/sleeper';

export interface TeamRosterData {
    rosterId:    number;
    rank:        number;
    teamName:    string;
    username?:   string;
    avatar?:     string | null;
    wins:        number;
    losses:      number;
    ties:        number;
    fpts:        number;
    starters:    string[];
    bench:       string[];
    starterSlots: string[];
}

interface Props {
    teams:   TeamRosterData[];
    players: Record<string, SlimPlayer>;
}

const POS_STYLES: Record<string, string> = {
    QB:         'bg-rose-900/70 text-rose-300',
    RB:         'bg-emerald-900/70 text-emerald-300',
    WR:         'bg-sky-900/70 text-sky-300',
    TE:         'bg-amber-900/70 text-amber-300',
    K:          'bg-violet-900/70 text-violet-300',
    DEF:        'bg-slate-700 text-slate-300',
    FLEX:       'bg-yellow-900/70 text-yellow-300',
    SUPER_FLEX: 'bg-yellow-900/70 text-yellow-300',
    BN:         'bg-gray-800 text-gray-500',
    IR:         'bg-red-900/40 text-red-400',
};

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

function PosBadge({ pos }: { pos: string }) {
    const style = POS_STYLES[pos] ?? 'bg-gray-800 text-gray-400';
    const label = pos === 'SUPER_FLEX' ? 'SF' : pos;
    return (
        <span className={`inline-block w-10 text-center px-1 py-0.5 rounded text-[10px] font-bold shrink-0 ${style}`}>
            {label}
        </span>
    );
}

function PlayerRow({ playerId, slotPos, players }: {
    playerId: string;
    slotPos:  string;
    players:  Record<string, SlimPlayer>;
}) {
    const player = players[playerId];
    if (!player || playerId === '0') {
        return (
            <div className="flex items-center gap-2 py-1.5">
                <PosBadge pos={slotPos} />
                <span className="text-gray-700 text-sm italic">Empty</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2 py-1.5">
            <PosBadge pos={slotPos} />
            <span className="text-white text-sm font-medium flex-1 min-w-0 truncate">{player.full_name}</span>
            <span className="text-gray-600 text-xs shrink-0">{player.team}</span>
        </div>
    );
}

function TeamCard({ team, players, defaultOpen }: {
    team:        TeamRosterData;
    players:     Record<string, SlimPlayer>;
    defaultOpen: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const sortedBench = [...team.bench].sort((a, b) => {
        const pa = players[a]?.position ?? 'ZZ';
        const pb = players[b]?.position ?? 'ZZ';
        return (POS_ORDER[pa] ?? 99) - (POS_ORDER[pb] ?? 99);
    });

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button type="button" onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/40 transition text-left">
                <span className="text-gray-500 font-semibold text-sm w-5 shrink-0">{team.rank}</span>
                {team.avatar ? (
                    <Image src={`https://sleepercdn.com/avatars/thumbs/${team.avatar}`}
                        alt={team.teamName} width={32} height={32} className="rounded-full shrink-0" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs font-bold text-gray-600">
                        {team.teamName[0]?.toUpperCase() ?? '?'}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{team.teamName}</p>
                    {team.username && <p className="text-gray-600 text-xs">@{team.username}</p>}
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-gray-200">
                        {team.wins}–{team.losses}{team.ties > 0 ? `–${team.ties}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">{team.fpts.toFixed(2)} pts</p>
                </div>
                <span className={`shrink-0 text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {open && (
                <div className="border-t border-gray-800 px-5 py-4">
                    <div className="grid sm:grid-cols-2 gap-6">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Starters</p>
                            <div className="divide-y divide-gray-800/50">
                                {team.starters.map((pid, i) => (
                                    <PlayerRow key={`${pid}-${i}`} playerId={pid}
                                        slotPos={team.starterSlots[i] ?? 'BN'} players={players} />
                                ))}
                                {team.starters.length === 0 && (
                                    <p className="text-gray-700 text-sm italic py-2">No starters set</p>
                                )}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bench</p>
                            <div className="divide-y divide-gray-800/50">
                                {sortedBench.map((pid) => (
                                    <PlayerRow key={pid} playerId={pid}
                                        slotPos={players[pid]?.position ?? 'BN'} players={players} />
                                ))}
                                {sortedBench.length === 0 && (
                                    <p className="text-gray-700 text-sm italic py-2">No bench players</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function RosterCards({ teams, players }: Props) {
    return (
        <div className="space-y-3">
            {teams.map((team, i) => (
                <TeamCard key={team.rosterId} team={team} players={players} defaultOpen={i === 0} />
            ))}
        </div>
    );
}
