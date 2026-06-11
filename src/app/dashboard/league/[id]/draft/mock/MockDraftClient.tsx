'use client';

import { useState, useCallback } from 'react';
import type {
    MockDraftInitResponse,
    MockDraftStepResult,
    MockDraftResult,
    MockDraftState,
    MockDraftPick,
    MockPlayer,
    MockLeagueContext,
} from '@/lib/mock-draft/types';
import {
    initializeDraftState,
    runUntilUserPick,
    applyUserPick,
    resumeAfterUserPick,
} from '@/lib/mock-draft/DraftLoopEngine';
import { rankCandidatesForTeam } from '@/lib/mock-draft/ScoringEngine';
import OnTheClockPanel    from './OnTheClockPanel';
import DraftHistoryPanel  from './DraftHistoryPanel';

// ── Phase types ───────────────────────────────────────────────────────────────

type PhaseIdle    = { phase: 'idle' };
type PhaseLoading = { phase: 'loading' };
type PhaseError   = { phase: 'error'; message: string };
type PhaseOnClock = {
    phase:       'on_clock';
    stepResult:  Extract<MockDraftStepResult, { state: 'USER_ON_THE_CLOCK' }>;
    initData:    MockDraftInitResponse;
};
type PhaseComplete = {
    phase:    'complete';
    results:  MockDraftResult[];
    initData: MockDraftInitResponse;
};

type ClientPhase = PhaseIdle | PhaseLoading | PhaseError | PhaseOnClock | PhaseComplete;

// ── Helpers ───────────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
    QB: 'bg-red-900/40 text-red-300 border-red-800',
    RB: 'bg-green-900/40 text-green-300 border-green-800',
    WR: 'bg-blue-900/40 text-blue-300 border-blue-800',
    TE: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
};

function draftTypeLabel(settings: MockDraftInitResponse['context']['settings']): string {
    if (settings.isRookieDraft) return 'Rookie Draft';
    if (settings.isDynasty)    return 'Startup Dynasty Draft';
    return 'Redraft';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MockDraftClient({
    leagueId,
    leagueName,
}: {
    leagueId:    string;
    leagueName:  string;
}) {
    const [clientPhase, setClientPhase] = useState<ClientPhase>({ phase: 'idle' });

    // ── Start / restart ───────────────────────────────────────────────────────

    const startDraft = useCallback(async () => {
        setClientPhase({ phase: 'loading' });
        try {
            const res = await fetch(`/api/mock-draft/init?leagueId=${leagueId}`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data: MockDraftInitResponse = await res.json();

            const state      = initializeDraftState(data.context);
            const stepResult = runUntilUserPick(state, data.context, data.board);

            if (stepResult.state === 'USER_ON_THE_CLOCK') {
                setClientPhase({ phase: 'on_clock', stepResult, initData: data });
            } else {
                setClientPhase({ phase: 'complete', results: stepResult.results, initData: data });
            }
        } catch (err) {
            setClientPhase({ phase: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
    }, [leagueId]);

    // ── User selects a player ─────────────────────────────────────────────────

    const handleDraft = useCallback((playerId: string) => {
        if (clientPhase.phase !== 'on_clock') return;
        const { stepResult, initData } = clientPhase;

        const newState  = applyUserPick(stepResult.draftState, initData.context, initData.board, playerId);
        const nextStep  = resumeAfterUserPick(newState, initData.context, initData.board);

        if (nextStep.state === 'USER_ON_THE_CLOCK') {
            setClientPhase({ phase: 'on_clock', stepResult: nextStep, initData });
        } else {
            setClientPhase({ phase: 'complete', results: nextStep.results, initData });
        }
    }, [clientPhase]);

    // ── Auto-pick for the user ────────────────────────────────────────────────

    const handleAutoPick = useCallback(() => {
        if (clientPhase.phase !== 'on_clock') return;
        const { stepResult, initData } = clientPhase;

        const userTeam   = initData.context.teams.find(t => t.teamId === initData.context.yourTeamId);
        const userNeeds  = stepResult.draftState.teamNeeds.get(initData.context.yourTeamId)
            ?? userTeam?.needsProfile;
        if (!userNeeds) return;

        // Auto-pick with no chaos so it's deterministic and explainable
        const pers     = { riskTolerance: 'MEDIUM' as const, needBias: 0.5, chaosBias: 0 };
        const ranked   = rankCandidatesForTeam(stepResult.availablePlayers, userNeeds, pers);
        if (ranked.length > 0) handleDraft(ranked[0].player.playerId);
    }, [clientPhase, handleDraft]);

    // ── Renders ───────────────────────────────────────────────────────────────

    if (clientPhase.phase === 'idle') {
        return <IdleScreen leagueName={leagueName} onStart={startDraft} />;
    }

    if (clientPhase.phase === 'loading') {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="text-center space-y-3">
                    <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-gray-400 text-sm">Loading league data...</p>
                </div>
            </div>
        );
    }

    if (clientPhase.phase === 'error') {
        return (
            <div className="text-center py-16 space-y-4">
                <p className="text-red-400 font-semibold">Failed to load draft data</p>
                <p className="text-gray-500 text-sm">{clientPhase.message}</p>
                <button
                    onClick={startDraft}
                    className="px-5 py-2 bg-[#D4AF37] text-black font-bold rounded-xl text-sm hover:bg-[#c9a227] transition"
                >
                    Try Again
                </button>
            </div>
        );
    }

    if (clientPhase.phase === 'on_clock') {
        const { stepResult, initData } = clientPhase;
        return (
            <div className="space-y-4">
                <DraftHeader
                    initData={initData}
                    pickIndex={stepResult.draftState.currentPickIndex}
                    onRestart={startDraft}
                />
                <OnTheClockPanel
                    currentPick={stepResult.currentPick}
                    availablePlayers={stepResult.availablePlayers}
                    draftState={stepResult.draftState}
                    context={initData.context}
                    onDraft={handleDraft}
                    onAutoPick={handleAutoPick}
                />
            </div>
        );
    }

    if (clientPhase.phase === 'complete') {
        const { results, initData } = clientPhase;
        return (
            <CompleteScreen
                results={results}
                initData={initData}
                onRestart={startDraft}
            />
        );
    }

    return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DraftHeader({
    initData,
    pickIndex,
    onRestart,
}: {
    initData:   MockDraftInitResponse;
    pickIndex:  number;
    onRestart:  () => void;
}) {
    const { settings } = initData.context;
    const pct = Math.round((pickIndex / (settings.totalTeams * settings.totalRounds)) * 100);

    return (
        <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
                <h1 className="text-xl font-bold text-white">Mock Draft</h1>
                <p className="text-gray-500 text-sm mt-0.5">
                    {draftTypeLabel(settings)} · {settings.totalTeams} teams · {settings.totalRounds} rounds
                    {settings.superflex ? ' · SF' : ''}{settings.tePremium ? ' · TE+' : ''}
                </p>
            </div>
            <div className="flex items-center gap-3">
                <div className="text-right text-xs text-gray-500">
                    Pick {pickIndex} of {settings.totalTeams * settings.totalRounds}
                    <div className="w-24 h-1 bg-gray-800 rounded-full mt-1 ml-auto">
                        <div className="h-full bg-[#D4AF37] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                </div>
                <button
                    onClick={onRestart}
                    className="px-3 py-1.5 text-xs font-semibold border border-gray-700 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-200 transition"
                >
                    Restart
                </button>
            </div>
        </div>
    );
}

function IdleScreen({
    leagueName,
    onStart,
}: {
    leagueName: string;
    onStart:    () => void;
}) {
    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Mock Draft</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{leagueName}</p>
                </div>
                <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-5">
                <div className="text-5xl">🎯</div>
                <div>
                    <h2 className="text-lg font-bold text-white">Practice Your Draft</h2>
                    <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
                        Simulate your upcoming draft against AI opponents calibrated to your league
                        — scoring format, roster settings, and positional needs included.
                        No results are saved; run as many times as you want.
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-500">
                    <span>✓ BPA-ranked player pool</span>
                    <span>✓ Roster need awareness</span>
                    <span>✓ 10-player reach window</span>
                    <span>✓ Human-like randomness</span>
                </div>
                <button
                    onClick={onStart}
                    className="px-8 py-3 bg-[#D4AF37] text-black font-bold rounded-xl hover:bg-[#c9a227] transition text-sm"
                >
                    Start Mock Draft
                </button>
            </div>
        </div>
    );
}

function CompleteScreen({
    results,
    initData,
    onRestart,
}: {
    results:   MockDraftResult[];
    initData:  MockDraftInitResponse;
    onRestart: () => void;
}) {
    const yourPicks = results.filter(r => r.teamId === initData.context.yourTeamId);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-white">Draft Complete</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{results.length} total picks</p>
                </div>
                <button
                    onClick={onRestart}
                    className="px-5 py-2 bg-[#D4AF37] text-black font-bold rounded-xl text-sm hover:bg-[#c9a227] transition"
                >
                    Run Again
                </button>
            </div>

            {/* Your picks */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold text-white">Your Picks ({yourPicks.length})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {yourPicks.map(r => (
                        <div
                            key={r.pick.overall}
                            className="flex items-center gap-3 px-3 py-2.5 bg-gray-800/40 border border-gray-700/50 rounded-xl text-sm"
                        >
                            <span className="text-gray-500 text-xs w-8 shrink-0">
                                {r.pick.round}.{String(r.pick.slot).padStart(2, '0')}
                            </span>
                            <span className={`shrink-0 px-1.5 py-px rounded border text-[10px] font-bold ${POS_COLORS[r.player.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                {r.player.position}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold truncate">{r.player.name}</p>
                                <p className="text-gray-500 text-xs">{r.player.team ?? 'FA'}{r.player.age ? ` · Age ${r.player.age}` : ''}</p>
                            </div>
                            {r.source === 'USER' && (
                                <span className="text-[9px] font-bold text-[#D4AF37] shrink-0">YOUR PICK</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Full draft history */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold text-white">Full Draft Board</h2>
                <DraftHistoryPanel results={results} yourTeamId={initData.context.yourTeamId} />
            </div>
        </div>
    );
}
