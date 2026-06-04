'use client';

import { useState, useCallback } from 'react';
import type { DraftRecommendation } from '@/lib/draft/scoring';

interface DraftOption {
    draftId: string;
    label:   string;
    status:  string;
    rounds:  number;
    teams:   number;
}

interface RosterOption {
    rosterId:    string;
    displayName: string;
    ownerId:     string | null;
}

interface Meta {
    currentPick:        number;
    currentRound:       number;
    totalRounds:        number;
    draftType:          'rookie' | 'startup';
    onTheClockRosterId: string | null;
    myPickCount:        number;
    teamMode:           'WIN_NOW' | 'BALANCED' | 'REBUILD';
    trajectoryWindow:   'WIN_NOW' | 'ASCENDING' | 'PLATEAU' | 'REBUILD';
    horizonYears:       1 | 2 | 3;
    riskTolerance:      'LOW' | 'MEDIUM' | 'HIGH';
    trajectoryLabel:    string;
}

interface Props {
    leagueId:      string;
    draftOptions:  DraftOption[];
    rosterOptions: RosterOption[];
    myRosterId:    string | null;
}

const POS_COLORS: Record<string, string> = {
    QB: 'bg-red-900/40 text-red-300 border-red-700/60',
    RB: 'bg-blue-900/40 text-blue-300 border-blue-700/60',
    WR: 'bg-green-900/40 text-green-300 border-green-700/60',
    TE: 'bg-orange-900/40 text-orange-300 border-orange-700/60',
    K:  'bg-gray-800 text-gray-400 border-gray-700',
};

function posBadge(pos: string) {
    return POS_COLORS[pos] ?? 'bg-gray-800 text-gray-400 border-gray-700';
}

function fiqColor(score: number) {
    if (score >= 85) return 'text-[#D4AF37]';
    if (score >= 75) return 'text-green-400';
    if (score >= 65) return 'text-blue-400';
    return 'text-gray-400';
}

function tierBadgeClass(tier: number) {
    if (tier === 1) return 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40';
    if (tier === 2) return 'bg-green-900/40 text-green-300 border-green-700/60';
    if (tier === 3) return 'bg-blue-900/40 text-blue-300 border-blue-700/60';
    return 'bg-gray-800 text-gray-500 border-gray-700';
}

export default function DraftAssistantPanel({
    leagueId,
    draftOptions,
    rosterOptions,
    myRosterId,
}: Props) {
    const [selectedDraftId,  setSelectedDraftId]  = useState(draftOptions[0]?.draftId ?? '');
    // Do NOT fall back to rosterOptions[0] — silently using someone else's roster causes wrong trajectory/BPA.
    // If myRosterId is null the user must explicitly choose their team from the dropdown.
    const [selectedRosterId, setSelectedRosterId] = useState(myRosterId ?? '');
    const [recommendations,  setRecommendations]  = useState<DraftRecommendation[] | null>(null);
    const [meta,             setMeta]             = useState<Meta | null>(null);
    const [tradeDownNote,    setTradeDownNote]    = useState<string | null>(null);
    const [loading,          setLoading]          = useState(false);
    const [error,            setError]            = useState<string | null>(null);

    const fetchRecommendations = useCallback(async () => {
        if (!selectedDraftId || !selectedRosterId) return;
        setLoading(true);
        setError(null);

        try {
            const url = `/api/draft-assistant?leagueId=${leagueId}&sleeperDraftId=${selectedDraftId}&myRosterId=${selectedRosterId}`;
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Failed to load recommendations');
            setRecommendations(data.recommendations);
            setMeta(data.meta);
            setTradeDownNote(data.tradeDownNote ?? null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load recommendations');
        } finally {
            setLoading(false);
        }
    }, [leagueId, selectedDraftId, selectedRosterId]);

    const onTheClockTeam = meta?.onTheClockRosterId
        ? rosterOptions.find(r => r.rosterId === meta.onTheClockRosterId)?.displayName
        : null;

    if (draftOptions.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-2">
                <p className="text-white font-semibold">No Active Drafts</p>
                <p className="text-gray-500 text-sm">No startup or rookie drafts are currently in progress for this league.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-3">Live Draft Assistant</p>
                    <div className="flex flex-wrap gap-3 items-end">
                        {/* Draft picker */}
                        <div className="space-y-1">
                            <label className="text-gray-500 text-xs block">Draft</label>
                            <select
                                value={selectedDraftId}
                                onChange={e => { setSelectedDraftId(e.target.value); setRecommendations(null); }}
                                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gray-500 min-w-[180px]"
                            >
                                {draftOptions.map(d => (
                                    <option key={d.draftId} value={d.draftId}>
                                        {d.label} ({d.teams}-team, {d.rounds} rds)
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Team picker */}
                        <div className="space-y-1">
                            <label className={`text-xs block ${!myRosterId ? 'text-amber-400' : 'text-gray-500'}`}>
                                {!myRosterId ? '⚠ Select your team' : 'I am'}
                            </label>
                            <select
                                value={selectedRosterId}
                                onChange={e => { setSelectedRosterId(e.target.value); setRecommendations(null); }}
                                className={`bg-gray-800 border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gray-500 min-w-[160px] ${!myRosterId ? 'border-amber-700/60' : 'border-gray-700'}`}
                            >
                                {!myRosterId && <option value="">— pick your team —</option>}
                                {rosterOptions.map(r => (
                                    <option key={r.rosterId} value={r.rosterId}>{r.displayName}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={fetchRecommendations}
                            disabled={loading || !selectedDraftId || !selectedRosterId}
                            className="px-4 py-1.5 rounded-lg bg-[#D4AF37] text-black text-xs font-bold hover:bg-[#BF9D2F] transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Loading…' : 'Get Recommendations'}
                        </button>

                        {recommendations && (
                            <button
                                onClick={fetchRecommendations}
                                disabled={loading}
                                className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 text-xs hover:text-white hover:border-gray-500 transition disabled:opacity-40"
                            >
                                ↺ Refresh
                            </button>
                        )}
                    </div>
                </div>

                {!myRosterId && (
                    <p className="text-amber-400/80 text-xs">
                        We couldn&apos;t auto-detect your roster. Select your team above so recommendations are based on your roster, picks, and trajectory — not someone else&apos;s.
                        {' '}<a href="/dashboard/sync/sleeper" className="underline hover:text-amber-300 transition">Connect your Sleeper account</a> to auto-detect next time.
                    </p>
                )}
                {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>

            {/* Draft state header */}
            {meta && (
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Round</p>
                            <p className="text-white font-bold text-lg leading-none">{meta.currentRound}<span className="text-gray-600 text-sm font-normal">/{meta.totalRounds}</span></p>
                        </div>
                        <div className="w-px h-8 bg-gray-800" />
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pick</p>
                            <p className="text-white font-bold text-lg leading-none">{meta.currentPick}</p>
                        </div>
                        <div className="w-px h-8 bg-gray-800" />
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">My Picks</p>
                            <p className="text-white font-bold text-lg leading-none">{meta.myPickCount}</p>
                        </div>
                        {onTheClockTeam && (
                            <>
                                <div className="w-px h-8 bg-gray-800" />
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">On the Clock</p>
                                    <p className="text-[#D4AF37] font-semibold text-sm leading-none truncate max-w-[120px]">{onTheClockTeam}</p>
                                </div>
                            </>
                        )}
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-gray-800 text-gray-400 border-gray-700 uppercase">
                        {meta.draftType === 'rookie' ? 'Rookie Draft' : 'Startup Draft'}
                    </span>
                    {meta.trajectoryLabel && (
                        <span className={[
                            'text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide',
                            meta.trajectoryLabel === 'All-In'     ? 'bg-red-900/40 text-red-300 border-red-700/60' :
                            meta.trajectoryLabel === 'Win-Now'    ? 'bg-red-900/30 text-red-300 border-red-700/50' :
                            meta.trajectoryLabel === 'Contender'  ? 'bg-amber-900/30 text-amber-300 border-amber-700/50' :
                            meta.trajectoryLabel === 'Youth-Build'? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50' :
                            meta.trajectoryLabel === 'Tank'       ? 'bg-indigo-900/40 text-indigo-300 border-indigo-700/60' :
                            'bg-blue-900/30 text-blue-300 border-blue-700/50',
                        ].join(' ')}>
                            {meta.trajectoryLabel} · {meta.horizonYears}-yr
                        </span>
                    )}
                </div>
            )}

            {/* Trade-down banner */}
            {tradeDownNote && (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="text-amber-400 text-base shrink-0 mt-0.5">⚡</span>
                    <div>
                        <p className="text-amber-300 text-xs font-bold uppercase tracking-wider mb-0.5">Trade-Down Opportunity</p>
                        <p className="text-amber-200/80 text-xs">{tradeDownNote}</p>
                    </div>
                </div>
            )}

            {/* Recommendations */}
            {recommendations && recommendations.length > 0 && (
                <div className="space-y-3">
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Top Picks</p>
                    {recommendations.map((rec, i) => (
                        <div key={rec.sleeperPlayerId || rec.name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                {/* Rank */}
                                <div className="shrink-0 w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500 mt-0.5">
                                    {i + 1}
                                </div>

                                {/* Player info */}
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${posBadge(rec.position)}`}>
                                            {rec.position}
                                        </span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tierBadgeClass(rec.tier)}`}>
                                            T{rec.tier}
                                        </span>
                                        <span className="text-white font-semibold text-sm truncate">{rec.name}</span>
                                        {rec.team && (
                                            <span className="text-gray-500 text-xs">{rec.team}</span>
                                        )}
                                        {rec.age && (
                                            <span className="text-gray-600 text-xs">Age {rec.age}</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className={`text-xs font-bold ${fiqColor(rec.fiqScore)}`}>
                                            FiQ {rec.fiqScore}
                                        </span>
                                        {rec.adpVsPick !== null && (
                                            <span className={`text-xs font-semibold ${rec.adpVsPick >= 3 ? 'text-green-400' : rec.adpVsPick <= -3 ? 'text-orange-400' : 'text-gray-400'}`}>
                                                {rec.adpVsPick >= 0 ? `+${rec.adpVsPick}` : rec.adpVsPick} vs ADP
                                            </span>
                                        )}
                                    </div>

                                    <ul className="space-y-0.5">
                                        {rec.reasons.map((reason, ri) => (
                                            <li key={ri} className="text-gray-500 text-xs flex items-start gap-1.5">
                                                <span className="text-gray-700 shrink-0 mt-0.5">•</span>
                                                {reason}
                                            </li>
                                        ))}
                                    </ul>
                                    {rec.trajectoryNote && (
                                        <p className="text-[10px] text-indigo-400/70 italic mt-0.5">
                                            {rec.trajectoryNote}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {recommendations && recommendations.length === 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                    <p className="text-gray-400 text-sm">No available players found. The draft may be complete.</p>
                </div>
            )}
        </div>
    );
}
