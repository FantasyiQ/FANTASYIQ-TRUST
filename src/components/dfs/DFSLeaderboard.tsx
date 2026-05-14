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

interface DFSLeaderboardProps {
    lineups:    LeaderboardRow[];
    myUserId?:  string;
    status:     string;
}

export default function DFSLeaderboard({ lineups, myUserId, status }: DFSLeaderboardProps) {
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
                            onClick={() => setExpanded(isOpen ? null : row.id)}
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
                                {status === 'OPEN' ? (
                                    <span className="text-gray-500 text-xs">Locked 🔒</span>
                                ) : (
                                    `${row.totalPoints.toFixed(1)} pts`
                                )}
                            </span>

                            {/* Expand chevron */}
                            {(status !== 'OPEN' || isMe) && (
                                <span className={`text-gray-500 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                                    ▼
                                </span>
                            )}
                        </button>

                        {/* Expanded lineup */}
                        {isOpen && entries.length > 0 && (
                            <div className="px-4 pb-3 border-t border-gray-800 pt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                                {entries.map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className="text-[9px] text-gray-500 uppercase w-12 shrink-0">{e.slot}</span>
                                        <span className="text-gray-300 truncate">{e.playerId}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
