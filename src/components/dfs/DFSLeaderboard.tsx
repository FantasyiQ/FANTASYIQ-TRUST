'use client';

import { useState } from 'react';

interface LineupEntry {
    slot:     string;
    playerId: string;
}

interface LeaderboardRow {
    id:          string;
    totalPoints: number;
    entriesJson: unknown;
    locked:      boolean;
    user:        { id: string; name: string | null };
}

interface PlayerInfo {
    playerId: string;
    fullName: string;
    position: string;
    team:     string | null;
}

interface DFSLeaderboardProps {
    lineups:        LeaderboardRow[];
    myUserId?:      string;
    status:         string;
    isLocked?:      boolean;
    // Every player appearing in any lineup on this page, resolved once
    // server-side — entriesJson only ever stored {slot, playerId}, so
    // without this the expanded view had nothing but the raw ID to show.
    players?:         Record<string, PlayerInfo>;
    pointsByPlayer?:  Record<string, number>;
    opponentByTeam?:  Record<string, string>;
}

export default function DFSLeaderboard({
    lineups, myUserId, status, isLocked = false, players = {}, pointsByPlayer = {}, opponentByTeam = {},
}: DFSLeaderboardProps) {
    const [expanded, setExpanded] = useState<string | null>(null);

    if (lineups.length === 0) {
        return (
            <p className="text-gray-600 text-sm">
                No lineups submitted yet. Be the first!
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {lineups.map((row, idx) => {
                const rank    = idx + 1;
                const isMe    = row.user.id === myUserId;
                const isOpen  = expanded === row.id;
                const entries = row.entriesJson as LineupEntry[];

                return (
                    <div
                        key={row.id}
                        className={`rounded-xl border transition ${
                            isMe ? 'border-[#D4AF37]/40 bg-[#D4AF37]/5' : 'border-gray-800 bg-gray-900'
                        }`}
                    >
                        <button
                            className="w-full flex items-center gap-3 px-4 py-3 text-left"
                            onClick={() => (isLocked || isMe) && setExpanded(isOpen ? null : row.id)}
                        >
                            {/* Rank */}
                            <span className={`text-lg font-black tabular-nums w-8 shrink-0 ${
                                rank === 1 ? 'text-[#D4AF37]' :
                                rank === 2 ? 'text-gray-300'  :
                                rank === 3 ? 'text-amber-700' : 'text-gray-600'
                            }`}>
                                {rank}
                            </span>

                            {/* Name */}
                            <span className="flex-1 text-sm font-semibold text-white truncate">
                                {row.user.name ?? 'Anonymous'}
                                {isMe && <span className="ml-1.5 text-[9px] text-[#D4AF37]">(you)</span>}
                            </span>

                            {/* Score */}
                            <span className="text-sm font-bold text-white tabular-nums shrink-0">
                                {!isLocked ? (
                                    <span className="text-gray-500 text-xs">Locked 🔒</span>
                                ) : (
                                    `${row.totalPoints.toFixed(2)} pts`
                                )}
                            </span>

                            {/* Expand chevron — only shown when lineup is visible */}
                            {(isLocked || isMe) && (
                                <span className={`text-gray-500 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                                    ▼
                                </span>
                            )}
                        </button>

                        {/* Expanded lineup — hidden for others until locked */}
                        {isOpen && (isLocked || isMe) && entries.length > 0 && (
                            <div className="px-4 pb-3 border-t border-gray-800 pt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                                {entries.map((e, i) => {
                                    const p   = players[e.playerId];
                                    const opp = p?.team ? opponentByTeam[p.team] : undefined;
                                    return (
                                        <div key={i} className="flex items-center gap-2 text-xs">
                                            <span className="text-[9px] text-gray-500 uppercase w-12 shrink-0">{e.slot}</span>
                                            <span className="text-gray-300 truncate flex-1">
                                                {p ? p.fullName : e.playerId}
                                                {p && (
                                                    <span className="text-gray-600 ml-1">
                                                        {p.position} · {p.team ?? '—'}{opp && ` vs ${opp}`}
                                                    </span>
                                                )}
                                            </span>
                                            {isLocked && (
                                                <span className="text-gray-500 font-semibold shrink-0 tabular-nums">
                                                    {(pointsByPlayer[e.playerId] ?? 0).toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
