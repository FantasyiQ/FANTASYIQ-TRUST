'use client';

import { useState } from 'react';
import type { TeamTradeInsights, MutualTradeProposal } from '@/lib/projection-engine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pts(n: number) { return n.toFixed(2); }

const POS_COLORS: Record<string, string> = {
    QB: 'text-red-400 bg-red-900/20 border-red-800',
    RB: 'text-emerald-400 bg-emerald-900/20 border-emerald-800',
    WR: 'text-sky-400 bg-sky-900/20 border-sky-800',
    TE: 'text-orange-400 bg-orange-900/20 border-orange-800',
};

function PosBadge({ pos }: { pos: string }) {
    return (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[pos] ?? 'text-gray-400 bg-gray-800 border-gray-700'}`}>
            {pos}
        </span>
    );
}

// ── Single trade row ──────────────────────────────────────────────────────────

function TradeRow({ trade, index }: { trade: MutualTradeProposal; index: number }) {
    return (
        <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-4 space-y-3">
            {/* Header: trading with + mutual gain */}
            <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">
                    Trade with <span className="text-gray-300 font-medium">{trade.tradingWith}</span>
                </span>
                <span className="text-[11px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-2 py-0.5 rounded-full">
                    +{pts(trade.mutualGain)} mutual gain
                </span>
            </div>

            {/* Give / Get */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                {/* You Give */}
                <div className="rounded-lg bg-gray-900 border border-gray-700 p-3">
                    <div className="text-[10px] text-gray-600 font-bold uppercase tracking-wide mb-1.5">You Give</div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <PosBadge pos={trade.youGive.position} />
                        <span className="font-semibold text-white text-sm truncate">{trade.youGive.name}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">{trade.youGive.team} · FIQ: {pts(trade.youGive.fantasyIqProj)}</div>
                </div>

                {/* Arrow */}
                <div className="text-gray-700 text-lg font-light">⇄</div>

                {/* You Get */}
                <div className="rounded-lg bg-gray-900 border border-[#D4AF37]/30 p-3">
                    <div className="text-[10px] text-[#D4AF37]/70 font-bold uppercase tracking-wide mb-1.5">You Get</div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <PosBadge pos={trade.youGet.position} />
                        <span className="font-semibold text-white text-sm truncate">{trade.youGet.name}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">{trade.youGet.team} · FIQ: {pts(trade.youGet.fantasyIqProj)}</div>
                </div>
            </div>

            {/* Gain breakdown */}
            <div className="flex items-center gap-4 text-xs">
                <div>
                    <span className="text-gray-600">Your gain: </span>
                    <span className="text-emerald-400 font-bold font-mono">+{pts(trade.yourGain)}</span>
                </div>
                <div>
                    <span className="text-gray-600">Their gain: </span>
                    <span className="text-gray-400 font-mono">+{pts(trade.theirGain)}</span>
                </div>
            </div>
        </div>
    );
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({ insight }: { insight: TeamTradeInsights }) {
    const [open, setOpen] = useState(false);
    const hasTrades = insight.topTrades.length > 0;
    const bestGain  = insight.topTrades[0]?.yourGain ?? 0;

    return (
        <div className={`rounded-xl border transition-colors ${hasTrades ? 'bg-gray-900 border-[#D4AF37]/20' : 'bg-gray-900 border-gray-800'}`}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-800/30 rounded-xl transition"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{insight.teamName}</div>
                        {insight.username && <div className="text-gray-600 text-[11px]">@{insight.username}</div>}
                    </div>
                    {hasTrades ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] shrink-0">
                            {insight.topTrades.length} trade{insight.topTrades.length !== 1 ? 's' : ''} found
                        </span>
                    ) : (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-500 shrink-0">
                            No mutual upgrades
                        </span>
                    )}
                </div>
                <svg
                    className={`w-4 h-4 text-gray-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div className="px-5 pb-5 border-t border-gray-800">
                    {!hasTrades ? (
                        <p className="text-gray-600 text-xs py-4 text-center">
                            No 1-for-1 trades found this week that improve both teams&apos; optimized lineups.
                        </p>
                    ) : (
                        <div className="space-y-3 pt-4">
                            {insight.topTrades.map((trade, i) => (
                                <TradeRow key={`${trade.youGive.playerId}-${trade.youGet.playerId}`} trade={trade} index={i} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Off-season preview ────────────────────────────────────────────────────────

function OffSeasonPreview() {
    return (
        <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-8 text-center">
            <div className="text-3xl mb-3">🔄</div>
            <h3 className="font-bold text-white mb-1">Trade Insights</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Each week FantasyiQ surfaces win-win 1-for-1 trades between teams — simulating
                every eligible swap and keeping only the ones that improve both rosters&apos;
                optimized projected lineups simultaneously.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-4 py-1.5">
                <span className="text-[11px] font-bold text-[#D4AF37]">Active Week 1 · September</span>
            </div>
        </div>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

interface Props {
    insights:  TeamTradeInsights[];
    offSeason: boolean;
}

export default function TradeInsights({ insights, offSeason }: Props) {
    // Sort: teams with trades first, then by best gain desc
    const sorted = [...insights].sort((a, b) => {
        const aGain = a.topTrades[0]?.yourGain ?? 0;
        const bGain = b.topTrades[0]?.yourGain ?? 0;
        return bGain - aGain;
    });

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-white">Trade Insights</h2>
                <p className="text-gray-500 text-xs mt-0.5">
                    Win-win 1-for-1 trades that improve both teams&apos; optimized lineup projections this week
                </p>
            </div>

            {offSeason ? (
                <OffSeasonPreview />
            ) : sorted.length === 0 ? (
                <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-10 text-center">
                    <p className="text-gray-500 text-sm">No trade data available yet this week.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {sorted.map(ins => (
                        <TeamCard key={ins.rosterId} insight={ins} />
                    ))}
                </div>
            )}
        </div>
    );
}
