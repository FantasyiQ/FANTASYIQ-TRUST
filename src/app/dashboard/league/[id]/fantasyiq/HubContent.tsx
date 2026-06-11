'use client';

import { useState } from 'react';
import HubTabBar, { type HubTabKey } from './HubTabBar';

type SectionTab = 'lineups' | 'waiver' | 'trade' | 'roster';

interface HubContentProps {
    leagueId:     string;
    week:         number;
    season:       string;
    scoringType:  string;
    totalRosters: number;
    // Pre-rendered server slots — shown/hidden by client tab state
    lineups:      React.ReactNode;
    waiver:       React.ReactNode;
    trade:        React.ReactNode;
    roster:       React.ReactNode;
}

function scoringLabel(type: string) {
    if (type === 'ppr')      return 'PPR';
    if (type === 'half_ppr') return '0.5 PPR';
    return 'Standard';
}

export default function HubContent({
    leagueId,
    week,
    season,
    scoringType,
    totalRosters,
    lineups,
    waiver,
    trade,
    roster,
}: HubContentProps) {
    const [activeSection, setActiveSection] = useState<SectionTab>('lineups');

    function onSectionChange(tab: HubTabKey) {
        if (tab === 'lineups' || tab === 'waiver' || tab === 'trade' || tab === 'roster') {
            setActiveSection(tab);
        }
    }

    return (
        <div className="space-y-6">
            {/* Hub header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                    <p className="text-gray-500 text-sm mt-0.5">
                        {season} Season · Week {week}
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37] mb-1">FantasyiQ</div>
                    <div className="flex items-center gap-1 justify-end flex-wrap">
                        <span className="inline-flex items-center gap-1 bg-[#D4AF37]/10 border border-[#D4AF37]/25 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[#D4AF37]">
                            {scoringLabel(scoringType)}
                        </span>
                        <span className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                            {totalRosters} Teams
                        </span>
                        <span className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                            League-Calibrated
                        </span>
                    </div>
                </div>
            </div>

            {/* Tab bar */}
            <HubTabBar
                leagueId={leagueId}
                activeTab={activeSection}
                onSectionChange={onSectionChange}
            />

            {/* Tab content — all slots are pre-rendered server-side, hidden via CSS */}
            <div className={activeSection === 'lineups' ? '' : 'hidden'}>{lineups}</div>
            <div className={activeSection === 'waiver'  ? '' : 'hidden'}>{waiver}</div>
            <div className={activeSection === 'trade'   ? '' : 'hidden'}>{trade}</div>
            <div className={activeSection === 'roster'  ? '' : 'hidden'}>{roster}</div>
        </div>
    );
}
