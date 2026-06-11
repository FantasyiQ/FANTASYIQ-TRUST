'use client';

import type { MockDraftResult } from '@/lib/mock-draft/types';

const POS_COLORS: Record<string, string> = {
    QB:  'bg-red-900/40 text-red-300 border-red-800',
    RB:  'bg-green-900/40 text-green-300 border-green-800',
    WR:  'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:  'bg-yellow-900/40 text-yellow-300 border-yellow-800',
};

interface Props {
    results: MockDraftResult[];
    yourTeamId: string;
}

export default function DraftHistoryPanel({ results, yourTeamId }: Props) {
    if (results.length === 0) {
        return (
            <p className="text-gray-600 text-xs text-center py-4">No picks yet</p>
        );
    }

    return (
        <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
            {[...results].reverse().map(r => {
                const isUser = r.teamId === yourTeamId;
                return (
                    <div
                        key={`${r.pick.overall}-${r.player.playerId}`}
                        className={[
                            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                            isUser
                                ? 'bg-[#D4AF37]/10 border border-[#D4AF37]/20'
                                : 'bg-gray-800/40 border border-gray-800/50',
                        ].join(' ')}
                    >
                        <span className="text-gray-600 w-6 shrink-0 text-right">{r.pick.overall}</span>
                        <span
                            className={`shrink-0 px-1 py-px rounded border text-[9px] font-bold ${POS_COLORS[r.player.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}
                        >
                            {r.player.position}
                        </span>
                        <span className={`flex-1 font-medium truncate ${isUser ? 'text-[#D4AF37]' : 'text-gray-200'}`}>
                            {r.player.name}
                        </span>
                        <span className="text-gray-600 shrink-0 truncate max-w-[64px]">{r.ownerName}</span>
                        {r.source === 'USER' && (
                            <span className="shrink-0 text-[9px] font-bold text-[#D4AF37]">YOU</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
