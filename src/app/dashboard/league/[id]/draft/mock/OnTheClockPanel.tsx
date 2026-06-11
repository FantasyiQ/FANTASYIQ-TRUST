'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import type { MockPlayer, NeedsProfile, MockDraftPick, MockLeagueContext, MockDraftState } from '@/lib/mock-draft/types';
import { rankBestFitForTeam } from '@/lib/mock-draft/ScoringEngine';

const POS_COLORS: Record<string, string> = {
    QB: 'bg-red-900/40 text-red-300 border-red-800',
    RB: 'bg-green-900/40 text-green-300 border-green-800',
    WR: 'bg-blue-900/40 text-blue-300 border-blue-800',
    TE: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
};

const TIER_LABELS: Record<number, string> = {
    1: 'Elite', 2: 'Star', 3: 'Starter', 4: 'Depth', 5: 'Stash',
};

const TIER_COLORS: Record<number, string> = {
    1: 'text-[#D4AF37]',
    2: 'text-green-400',
    3: 'text-blue-400',
    4: 'text-gray-400',
    5: 'text-gray-600',
};

function NeedsBar({ label, value }: { label: string; value: number }) {
    const pct = Math.round(value * 100);
    const color = pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-green-600';
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400 w-8 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-gray-500 w-7 text-right shrink-0">{pct}%</span>
        </div>
    );
}

function PlayerCard({
    player,
    rank,
    onDraft,
    highlight,
}: {
    player:    MockPlayer;
    rank:      number;
    onDraft:   (id: string) => void;
    highlight?: boolean;
}) {
    return (
        <div
            className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer group',
                highlight
                    ? 'bg-[#D4AF37]/10 border-[#D4AF37]/30 hover:bg-[#D4AF37]/20'
                    : 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600',
            ].join(' ')}
            onClick={() => onDraft(player.playerId)}
        >
            <span className="text-gray-600 text-xs w-5 shrink-0 text-right">{rank}</span>
            {player.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={player.imageUrl}
                    alt={player.name}
                    className="w-8 h-8 rounded-full object-cover bg-gray-800 shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
            ) : (
                <div className="w-8 h-8 rounded-full bg-gray-800 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate group-hover:text-[#D4AF37] transition-colors">
                    {player.name}
                </p>
                <p className="text-gray-500 text-xs truncate">
                    {player.team ?? 'FA'}{player.age ? ` · Age ${player.age}` : ''}
                </p>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className={`text-[10px] font-bold px-1.5 py-px rounded border ${POS_COLORS[player.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                    {player.position}
                </span>
                <span className={`text-[10px] font-semibold ${TIER_COLORS[player.tier] ?? 'text-gray-500'}`}>
                    {TIER_LABELS[player.tier] ?? `T${player.tier}`}
                </span>
            </div>
            <button
                className="shrink-0 px-3 py-1 text-xs font-bold rounded-lg bg-[#D4AF37] text-black hover:bg-[#c9a227] transition"
                onClick={e => { e.stopPropagation(); onDraft(player.playerId); }}
            >
                Draft
            </button>
        </div>
    );
}

type Tab = 'bpa' | 'fit';

interface Props {
    currentPick:      MockDraftPick;
    availablePlayers: MockPlayer[];
    draftState:       MockDraftState;
    context:          MockLeagueContext;
    onDraft:          (playerId: string) => void;
    onAutoPick:       () => void;
}

export default function OnTheClockPanel({
    currentPick,
    availablePlayers,
    draftState,
    context,
    onDraft,
    onAutoPick,
}: Props) {
    const [tab, setTab] = useState<Tab>('bpa');
    const [posFilter, setPosFilter] = useState<string>('ALL');
    const historyBottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        historyBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [draftState.results.length]);

    const userTeam  = context.teams.find(t => t.teamId === context.yourTeamId);
    const userNeeds = draftState.teamNeeds.get(context.yourTeamId) ?? userTeam?.needsProfile;

    const bpaTop10 = useMemo(() => availablePlayers.slice(0, 10), [availablePlayers]);

    const bestFit = useMemo(() => {
        if (!userNeeds) return bpaTop10;
        return rankBestFitForTeam(availablePlayers, userNeeds).map(r => r.player);
    }, [availablePlayers, userNeeds]);

    const displayList = tab === 'bpa' ? bpaTop10 : bestFit;

    const posOptions = ['ALL', 'QB', 'RB', 'WR', 'TE'];
    const filtered = posFilter === 'ALL'
        ? displayList
        : displayList.filter(p => p.position === posFilter);

    const posLabels: Record<string, string> = {
        QB: 'Quarterback', RB: 'Running Back', WR: 'Wide Receiver', TE: 'Tight End',
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <p className="text-[#D4AF37] text-xs font-bold tracking-wider uppercase">You're On The Clock</p>
                    <p className="text-white text-xl font-bold mt-0.5">
                        Pick {currentPick.overall} · Round {currentPick.round}, Slot {currentPick.slot}
                    </p>
                    <p className="text-gray-400 text-sm mt-0.5">
                        {availablePlayers.length} players available
                    </p>
                </div>
                <button
                    onClick={onAutoPick}
                    className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition"
                >
                    Auto-Pick for Me
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left: player list */}
                <div className="lg:col-span-2 space-y-3">
                    {/* Tab bar */}
                    <div className="flex gap-0.5 border-b border-gray-800">
                        {(['bpa', 'fit'] as Tab[]).map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={[
                                    'px-4 pb-2.5 pt-1 text-sm transition whitespace-nowrap',
                                    tab === t
                                        ? 'font-semibold text-white border-b-2 border-[#D4AF37]'
                                        : 'text-gray-500 hover:text-gray-300',
                                ].join(' ')}
                            >
                                {t === 'bpa' ? 'Draft Board (BPA)' : 'Best Fit for Your Roster'}
                            </button>
                        ))}
                    </div>

                    {/* Position filter */}
                    <div className="flex gap-1.5 flex-wrap">
                        {posOptions.map(pos => (
                            <button
                                key={pos}
                                onClick={() => setPosFilter(pos)}
                                className={[
                                    'px-3 py-1 rounded-lg text-xs font-semibold border transition',
                                    posFilter === pos
                                        ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500',
                                ].join(' ')}
                            >
                                {pos}
                            </button>
                        ))}
                    </div>

                    {/* Player cards */}
                    <div className="space-y-1.5">
                        {filtered.length === 0 ? (
                            <p className="text-gray-600 text-sm text-center py-6">
                                No {posFilter !== 'ALL' ? (posLabels[posFilter] ?? posFilter) : 'players'} in top 10 BPA
                            </p>
                        ) : (
                            filtered.map((p, i) => (
                                <PlayerCard
                                    key={p.playerId}
                                    player={p}
                                    rank={i + 1}
                                    onDraft={onDraft}
                                    highlight={tab === 'fit' && i === 0}
                                />
                            ))
                        )}
                    </div>

                    {tab === 'bpa' && (
                        <p className="text-gray-600 text-xs text-center pt-1">
                            Showing top 10 BPA · AI opponents can only reach within this window
                        </p>
                    )}
                </div>

                {/* Right: needs + history */}
                <div className="space-y-4">
                    {/* Positional needs */}
                    {userNeeds && (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-4 space-y-3">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Your Roster Needs</p>
                            <div className="space-y-2">
                                <NeedsBar label="QB" value={userNeeds.QB} />
                                <NeedsBar label="RB" value={userNeeds.RB} />
                                <NeedsBar label="WR" value={userNeeds.WR} />
                                <NeedsBar label="TE" value={userNeeds.TE} />
                                {userNeeds.FLEX > 0 && <NeedsBar label="FLX" value={userNeeds.FLEX} />}
                            </div>
                        </div>
                    )}

                    {/* Draft history */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-4 space-y-3">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Recent Picks ({draftState.results.length} total)
                        </p>
                        {draftState.results.length === 0 ? (
                            <p className="text-gray-600 text-xs">No picks yet</p>
                        ) : (
                            <div className="space-y-1 max-h-[320px] overflow-y-auto">
                                {draftState.results.map(r => (
                                    <div
                                        key={`${r.pick.overall}-${r.player.playerId}`}
                                        className={[
                                            'flex items-center gap-2 py-1 text-xs',
                                            r.teamId === context.yourTeamId ? 'text-[#D4AF37]' : 'text-gray-400',
                                        ].join(' ')}
                                    >
                                        <span className="text-gray-600 w-5 shrink-0 text-right">{r.pick.overall}</span>
                                        <span className={`px-1 py-px rounded text-[9px] font-bold border ${POS_COLORS[r.player.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                            {r.player.position}
                                        </span>
                                        <span className="flex-1 truncate font-medium">{r.player.name}</span>
                                        <span className="text-gray-600 shrink-0 truncate max-w-[56px]">{r.ownerName}</span>
                                    </div>
                                ))}
                                <div ref={historyBottomRef} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
