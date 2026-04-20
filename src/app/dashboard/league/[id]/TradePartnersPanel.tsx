'use client';

import { useState, useEffect } from 'react';
import type { TradePartnersResponse, TradePartner, TradePartnerAsset } from '@/app/api/leagues/[leagueId]/trade-partners/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
    Elite:       'bg-[#C8A951]/15 text-[#C8A951] border-[#C8A951]/40',
    Contender:   'bg-green-900/30 text-green-400 border-green-800/50',
    Competitive: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
    Rebuilding:  'bg-gray-800 text-gray-500 border-gray-700',
};

const POS_COLORS: Record<string, string> = {
    QB: 'bg-red-900/40 text-red-300 border-red-800',
    RB: 'bg-green-900/40 text-green-300 border-green-800',
    WR: 'bg-blue-900/40 text-blue-300 border-blue-800',
    TE: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
};

const NEED_BADGE: Record<string, string> = {
    QB: 'bg-red-900/30 text-red-400 border-red-800/50',
    RB: 'bg-green-900/30 text-green-400 border-green-800/50',
    WR: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
    TE: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
};

function fitScoreColor(score: number): string {
    if (score >= 75) return 'text-green-400';
    if (score >= 50) return 'text-[#C8A951]';
    if (score >= 25) return 'text-orange-400';
    return 'text-gray-500';
}

function fitScoreBarColor(score: number): string {
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-[#C8A951]';
    if (score >= 25) return 'bg-orange-500';
    return 'bg-gray-600';
}

function rowBorderColor(score: number): string {
    if (score >= 75) return 'border-green-700/50';
    if (score >= 50) return 'border-[#C8A951]/40';
    if (score >= 25) return 'border-orange-700/40';
    return 'border-gray-700/30';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AssetRow({ asset }: { asset: TradePartnerAsset }) {
    return (
        <div className="flex items-center gap-2 py-1.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${POS_COLORS[asset.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                {asset.position}
            </span>
            <span className="text-white text-sm flex-1 flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="truncate">{asset.name}</span>
                {asset.isNew    && <span className="text-[9px] font-bold px-1 py-px rounded bg-[#C8A951]/10 text-[#C8A951] border border-[#C8A951]/30 shrink-0">NEW</span>}
                {asset.isTraded && <span className="text-[9px] font-bold px-1 py-px rounded bg-blue-900/30 text-blue-400 border border-blue-800/40 shrink-0">TRADED</span>}
                {asset.injuryStatus && asset.injuryStatus !== 'Active' && (
                    <span className="text-[9px] font-bold px-1 py-px rounded bg-orange-900/30 text-orange-400 border border-orange-800/40 shrink-0">{asset.injuryStatus.toUpperCase()}</span>
                )}
            </span>
            <span className="text-gray-500 text-xs shrink-0">{asset.team ?? '—'}</span>
            <div className="flex items-center gap-1 shrink-0">
                <span className="font-bold text-white text-sm">{asset.finalDtv}</span>
                {asset.delta !== null && asset.delta !== 0 && (
                    <span className={`text-[10px] font-bold ${asset.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {asset.delta > 0 ? `+${asset.delta}` : asset.delta}
                    </span>
                )}
                {asset.delta !== null && Math.abs(asset.delta) >= 10 && (
                    <span className="text-[9px] font-bold px-1 py-px rounded bg-orange-900/30 text-orange-400 border border-orange-800/40">HOT</span>
                )}
            </div>
        </div>
    );
}

function NeedPills({ positions }: { positions: string[] }) {
    if (positions.length === 0) return <span className="text-gray-600 text-xs">Balanced</span>;
    return (
        <div className="flex gap-1 flex-wrap">
            {positions.map(pos => (
                <span key={pos} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${NEED_BADGE[pos] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                    {pos}
                </span>
            ))}
        </div>
    );
}

function PartnerRow({
    partner,
    rank,
    expanded,
    onToggle,
}: {
    partner:  TradePartner;
    rank:     number;
    expanded: boolean;
    onToggle: () => void;
}) {
    const score = partner.tradeFitScore;

    return (
        <>
            <tr
                className={`hover:bg-gray-800/40 transition cursor-pointer border-l-2 ${rowBorderColor(score)}`}
                onClick={onToggle}
            >
                {/* Rank */}
                <td className="px-4 py-3.5 text-gray-500 font-bold text-sm w-10">{rank}</td>

                {/* Team */}
                <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                        <svg
                            className={`w-3.5 h-3.5 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <div>
                            <div className="text-white font-semibold text-sm">{partner.displayName}</div>
                            <div className="text-gray-600 text-xs">DTV {partner.totalRosterValue}</div>
                        </div>
                    </div>
                </td>

                {/* Fit score */}
                <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${fitScoreBarColor(score)}`}
                                style={{ width: `${score}%` }}
                            />
                        </div>
                        <span className={`font-extrabold text-base tabular-nums ${fitScoreColor(score)}`}>{score}</span>
                    </div>
                </td>

                {/* Tier */}
                <td className="px-3 py-3.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${TIER_BADGE[partner.tier] ?? TIER_BADGE.Competitive}`}>
                        {partner.tier}
                    </span>
                </td>

                {/* Your needs */}
                <td className="px-3 py-3.5">
                    <NeedPills positions={partner.yourNeeds} />
                </td>

                {/* Their needs */}
                <td className="px-4 py-3.5">
                    <NeedPills positions={partner.theirNeeds} />
                </td>
            </tr>

            {expanded && (
                <tr>
                    <td colSpan={6} className="px-0 py-0 bg-gray-900/60 border-b border-gray-800">
                        {/* Assets grid */}
                        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                    <span className="text-green-400">↓</span> Target from {partner.displayName}
                                </h4>
                                {partner.suggestedAssetsForYou.length > 0
                                    ? partner.suggestedAssetsForYou.map(a => <AssetRow key={a.playerId} asset={a} />)
                                    : <p className="text-gray-600 text-xs">No specific targets identified</p>
                                }
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                    <span className="text-[#C8A951]">↑</span> Offer to {partner.displayName}
                                </h4>
                                {partner.suggestedAssetsForThem.length > 0
                                    ? partner.suggestedAssetsForThem.map(a => <AssetRow key={a.playerId} asset={a} />)
                                    : <p className="text-gray-600 text-xs">No specific offers identified</p>
                                }
                            </div>
                        </div>

                        {/* Notes */}
                        {partner.notes.length > 0 && (
                            <div className="px-6 pb-4 border-t border-gray-800/60 pt-3">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Why this match</h4>
                                <ul className="space-y-1">
                                    {partner.notes.map((note, i) => (
                                        <li key={i} className="text-gray-400 text-xs flex items-start gap-2">
                                            <span className="text-[#C8A951] mt-px shrink-0">›</span>
                                            {note}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TradePartnersPanel({
    sleeperLeagueId,
    mySleeperUserId,
}: {
    sleeperLeagueId:  string;
    mySleeperUserId:  string | null;
}) {
    const [data,     setData]     = useState<TradePartnersResponse | null>(null);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (!mySleeperUserId) { setLoading(false); return; }
        fetch(`/api/leagues/${sleeperLeagueId}/trade-partners?ownerId=${encodeURIComponent(mySleeperUserId)}`)
            .then(r => {
                if (!r.ok) throw new Error(`${r.status}`);
                return r.json() as Promise<TradePartnersResponse>;
            })
            .then(d => { setData(d); setLoading(false); })
            .catch(e => { setError(String(e)); setLoading(false); });
    }, [sleeperLeagueId, mySleeperUserId]);

    const toggle = (rosterId: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(rosterId) ? next.delete(rosterId) : next.add(rosterId);
            return next;
        });
    };

    if (!mySleeperUserId) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <p className="text-gray-400 text-sm">Connect your Sleeper account to see trade partner suggestions.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 flex flex-col items-center gap-3">
                <div className="w-7 h-7 border-2 border-[#C8A951] border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Analyzing trade fits…</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <p className="text-red-400 text-sm">Failed to load trade partners.</p>
                <p className="text-gray-600 text-xs mt-1">{error}</p>
            </div>
        );
    }

    if (data.partners.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <p className="text-gray-400 text-sm">Your team was not found in this league's roster data.</p>
                <p className="text-gray-600 text-xs mt-1">Try syncing your league first.</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800">
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="font-bold text-lg">Trade Partners</h2>
                        <p className="text-gray-500 text-xs mt-0.5">
                            Best fits for {data.meta.myDisplayName ?? 'your team'} · {data.meta.teamCount} teams ranked by positional complementarity
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="w-2 h-2 rounded-full bg-green-500 inline-block shrink-0" /> Great ≥75
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="w-2 h-2 rounded-full bg-[#C8A951] inline-block shrink-0" /> Good ≥50
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block shrink-0" /> Limited
                        </span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[750px]">
                    <thead>
                        <tr className="border-b border-gray-800">
                            <th className="text-left px-4 py-3 text-gray-500 font-medium w-10">#</th>
                            <th className="text-left px-3 py-3 text-gray-500 font-medium">Team</th>
                            <th className="text-left px-3 py-3 text-gray-500 font-medium">Fit Score</th>
                            <th className="text-left px-3 py-3 text-gray-500 font-medium">Tier</th>
                            <th className="text-left px-3 py-3 text-gray-500 font-medium">Your Needs</th>
                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Their Needs</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {data.partners.map((partner, i) => (
                            <PartnerRow
                                key={partner.rosterId}
                                partner={partner}
                                rank={i + 1}
                                expanded={expanded.has(partner.rosterId)}
                                onToggle={() => toggle(partner.rosterId)}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-800">
                <p className="text-gray-600 text-xs">
                    Fit score based on positional complementarity, asset momentum, and roster tier contrast. Generated {new Date(data.meta.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                </p>
            </div>
        </div>
    );
}
