'use client';

import type { LeaguePhaseResult } from '@/lib/leaguePhase';

export default function PhaseDebugStrip({ phase }: { phase: LeaguePhaseResult }) {
    if (process.env.NODE_ENV !== 'development') return null;

    return (
        <div className="font-mono text-[11px] bg-black border border-green-900 rounded-lg px-4 py-2 text-green-400 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-bold text-green-300">PHASE DEBUG</span>
            <span>phase: <span className="text-white">{phase.phase}</span></span>
            <span>week: <span className="text-white">{phase.currentWeek}</span></span>
            <span>playoffStart: <span className="text-white">{phase.playoffWeekStart ?? '—'}</span></span>
            <span>champWeek: <span className="text-white">{phase.champWeek ?? '—'}</span></span>
            <span>rookieYear: <span className="text-white">{phase.activeRookieYear}</span></span>
            <span>buckets: <span className={phase.useBucketedPicks ? 'text-green-300' : 'text-gray-500'}>{String(phase.useBucketedPicks)}</span></span>
            <span>winNow: <span className={phase.isWinNowWindow ? 'text-yellow-300' : 'text-gray-500'}>{String(phase.isWinNowWindow)}</span></span>
            {phase.missingSettings && <span className="text-orange-400 font-bold">⚠ missing settings</span>}
        </div>
    );
}
