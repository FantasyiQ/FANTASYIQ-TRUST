'use client';

import { useState } from 'react';
import HubTabBar, { type HubTabKey } from './HubTabBar';

type SectionTab = 'lineups' | 'waiver' | 'trade' | 'roster';

interface HubContentProps {
    leagueId:    string;
    week:        number;
    season:      string;
    // Pre-rendered server slots — shown/hidden by client tab state
    lineups:     React.ReactNode;
    waiver:      React.ReactNode;
    trade:       React.ReactNode;
    roster:      React.ReactNode;
}

export default function HubContent({
    leagueId,
    week,
    season,
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
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>

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
