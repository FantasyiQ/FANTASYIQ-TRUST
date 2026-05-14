'use client';

import { useState } from 'react';
import type { TeamLineupOptimization, OptimizedSlot, LineupOptimizationResult, PlayerProjectionRow } from '@/lib/projection-engine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pts(n: number) { return n.toFixed(2); }

function GainBadge({ gain }: { gain: number }) {
    if (Math.abs(gain) < 0.01) {
        return (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-500">
                Already Optimal
            </span>
        );
    }
    if (gain > 0) {
        return (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37]">
                +{pts(gain)} pts available
            </span>
        );
    }
    return null;
}

function StatusIcon({ status, wasStarter }: { status: 'stay' | 'start'; wasStarter: boolean }) {
    if (status === 'stay') {
        return <span className="text-emerald-400 text-xs font-bold w-4 text-center">✓</span>;
    }
    return <span className="text-[#D4AF37] text-xs font-bold w-4 text-center">↑</span>;
}

function SlotLabel({ slot }: { slot: string }) {
    const colors: Record<string, string> = {
        QB:         'text-red-400',
        RB:         'text-emerald-400',
        WR:         'text-sky-400',
        TE:         'text-orange-400',
        FLEX:       'text-purple-400',
        SUPER_FLEX: 'text-purple-300',
        REC_FLEX:   'text-indigo-400',
        WRRB_FLEX:  'text-teal-400',
        K:          'text-gray-400',
        DEF:        'text-yellow-400',
    };
    return (
        <span className={`text-[10px] font-bold tracking-wide w-14 shrink-0 ${colors[slot] ?? 'text-gray-500'}`}>
            {slot}
        </span>
    );
}

// ── Lineup table ──────────────────────────────────────────────────────────────

function LineupTable({ result }: { result: LineupOptimizationResult }) {
    return (
        <div className="space-y-1">
            {/* Optimized starters */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[340px]">
                    <thead>
                        <tr className="border-b border-gray-800 text-gray-600 text-[10px] uppercase tracking-wider">
                            <th className="pb-1.5 w-14">Slot</th>
                            <th className="pb-1.5">Player</th>
                            <th className="pb-1.5 text-right">FIQ Proj</th>
                            <th className="pb-1.5 text-center w-12">Move</th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.optimizedSlots.map((sl, i) => (
                            <tr
                                key={`${sl.slot}-${sl.player.playerId}`}
                                className={`border-b border-gray-800/40 ${!sl.wasStarter ? 'bg-[#D4AF37]/5' : ''}`}
                            >
                                <td className="py-2">
                                    <SlotLabel slot={sl.slot} />
                                </td>
                                <td className="py-2 pr-2">
                                    <div className="flex items-center gap-1">
                                        <span className="font-medium text-white text-sm truncate max-w-[140px]">{sl.player.name}</span>
                                        {sl.player.injuryStatus && sl.player.injuryStatus !== 'Active' && (
                                            <span className={`text-[9px] font-bold px-1 rounded border ${
                                                sl.player.injuryStatus === 'Questionable'
                                                    ? 'text-yellow-400 border-yellow-700'
                                                    : 'text-red-400 border-red-800'
                                            }`}>
                                                {sl.player.injuryStatus === 'Questionable' ? 'Q' : sl.player.injuryStatus.slice(0, 3).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-gray-600">{sl.player.team} · {sl.player.position}</div>
                                </td>
                                <td className="py-2 text-right font-mono text-sm text-[#D4AF37] font-semibold">
                                    {pts(sl.player.fantasyIqProj)}
                                </td>
                                <td className="py-2 text-center">
                                    <StatusIcon status={sl.status} wasStarter={sl.wasStarter} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Benched starters (move to bench) */}
            {result.benchedStarters.length > 0 && (
                <div className="mt-3 rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 space-y-1.5">
                    <div className="text-[10px] font-bold tracking-widest text-gray-600 uppercase mb-2">Move to Bench</div>
                    {result.benchedStarters.map(p => (
                        <div key={p.playerId} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                                <span className="text-red-400 font-bold text-[10px] w-4">↓</span>
                                <span className="text-gray-400 font-medium truncate max-w-[140px]">{p.name}</span>
                                <span className="text-gray-700 text-[10px]">{p.position}</span>
                            </div>
                            <span className="font-mono text-gray-500">{pts(p.fantasyIqProj)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({ optimization }: { optimization: TeamLineupOptimization }) {
    const [open, setOpen] = useState(false);
    const { result } = optimization;
    const hasSwaps = result.swapCount > 0;

    return (
        <div className={`rounded-xl border transition-colors ${
            hasSwaps
                ? 'bg-gray-900 border-[#D4AF37]/20'
                : 'bg-gray-900 border-gray-800'
        }`}>
            {/* Header */}
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-800/30 rounded-xl transition"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{optimization.teamName}</div>
                        {optimization.username && (
                            <div className="text-gray-600 text-[11px]">@{optimization.username}</div>
                        )}
                    </div>
                    <GainBadge gain={result.gain} />
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {hasSwaps && (
                        <span className="text-[11px] text-gray-500">
                            {result.swapCount} swap{result.swapCount !== 1 ? 's' : ''}
                        </span>
                    )}
                    <svg
                        className={`w-4 h-4 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Expanded table */}
            {open && (
                <div className="px-5 pb-5 border-t border-gray-800">
                    {/* Summary row */}
                    <div className="flex items-center justify-between py-3 text-xs text-gray-500 mb-1">
                        <span>
                            Current: <span className="text-gray-300 font-medium font-mono">{pts(result.currentTotalProj)}</span>
                        </span>
                        <span className="text-gray-700">→</span>
                        <span>
                            Optimized: <span className="text-[#D4AF37] font-semibold font-mono">{pts(result.optimizedTotalProj)}</span>
                        </span>
                        {result.gain > 0 && (
                            <span className="text-[#D4AF37] font-bold font-mono">+{pts(result.gain)}</span>
                        )}
                    </div>
                    <LineupTable result={result} />
                </div>
            )}
        </div>
    );
}

// ── Off-season preview ────────────────────────────────────────────────────────

function OffSeasonPreview() {
    return (
        <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-8 text-center">
            <div className="text-3xl mb-3">🧠</div>
            <h3 className="font-bold text-white mb-1">Optimized Lineups</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Every week during the season, FantasyiQ will scan every roster in your league and
                surface the highest-projected valid lineup — with a one-click swap summary.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-4 py-1.5">
                <span className="text-[11px] font-bold text-[#D4AF37]">Active Week 1 · September</span>
            </div>
        </div>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

interface Props {
    optimizations: TeamLineupOptimization[];
    offSeason:     boolean;
}

export default function OptimizedLineups({ optimizations, offSeason }: Props) {
    // Sort: teams with available gain first, then by gain desc
    const sorted = [...optimizations].sort((a, b) => b.result.gain - a.result.gain);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white">Optimized Lineups</h2>
                    <p className="text-gray-500 text-xs mt-0.5">
                        Best valid starting lineup per team based on FantasyiQ projections
                    </p>
                </div>
            </div>

            {offSeason ? (
                <OffSeasonPreview />
            ) : sorted.length === 0 ? (
                <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-10 text-center">
                    <p className="text-gray-500 text-sm">No lineup data available yet this week.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {sorted.map(opt => (
                        <TeamCard key={opt.rosterId} optimization={opt} />
                    ))}
                </div>
            )}
        </div>
    );
}
