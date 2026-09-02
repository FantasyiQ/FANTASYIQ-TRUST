'use client';

import { useState } from 'react';
import { TeamRankingsTable, PowerRankingsTable } from '@/components/league/LeagueRankingsView';
import type { TeamRankingRow, PowerRankingRow } from '@/lib/league/getLeagueRankings';

type Tab = 'teams' | 'power';

interface Props {
    teamRankings:       TeamRankingRow[];
    powerRankings:      PowerRankingRow[];
    lastSeasonRankings: boolean;
}

export default function RedraftTeamPowerView({ teamRankings, powerRankings, lastSeasonRankings }: Props) {
    const [tab, setTab] = useState<Tab>('teams');
    const preseason = powerRankings.every(r => r.wins === 0 && r.losses === 0);

    const tabs = [
        { key: 'teams' as Tab, label: 'Teams' },
        { key: 'power' as Tab, label: 'Power' },
    ];

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="flex gap-4 border-b border-gray-800 px-4 pt-3">
                {tabs.map(t => {
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={
                                active
                                    ? 'font-semibold text-[#D4AF37] border-b-2 border-[#D4AF37] pb-2 text-sm transition'
                                    : 'text-gray-500 hover:text-white text-sm transition pb-2'
                            }
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>
            {tab === 'teams' && (
                <div>
                    <p className="px-6 py-2 border-b border-gray-800 text-xs text-gray-500">
                        Team totals are Value Over Replacement — real season projections, opportunity, and your league&apos;s scoring, not long-term or dynasty value.
                    </p>
                    <TeamRankingsTable rankings={teamRankings} valueLabel="Total VOR" />
                </div>
            )}
            {tab === 'power' && (
                <PowerRankingsTable rankings={powerRankings} preseason={preseason} lastSeasonRankings={lastSeasonRankings} />
            )}
        </div>
    );
}
