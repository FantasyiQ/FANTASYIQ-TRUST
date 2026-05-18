'use client';

import { useRouter } from 'next/navigation';

export type HubTabKey = 'lineups' | 'start-sit' | 'waiver' | 'trade' | 'roster' | 'dfs' | 'draft-strategy' | 'draft-assistant';

const TABS: { key: HubTabKey; label: string }[] = [
    { key: 'lineups',          label: 'Optimized Lineups' },
    { key: 'start-sit',        label: 'Start/Sit Intelligence' },
    { key: 'waiver',           label: 'Waiver Wire Intelligence' },
    { key: 'trade',            label: 'Trade Insights' },
    { key: 'roster',           label: 'Roster Intelligence' },
    { key: 'draft-strategy',   label: 'Draft Strategy' },
    { key: 'draft-assistant',  label: 'Live Draft' },
    { key: 'dfs',              label: 'Weekly DFS Challenge' },
];

// Section tabs live on the main /fantasyiq page (no route change — state only).
// Route tabs navigate to a nested sub-route.
const ROUTE_TABS = new Set<HubTabKey>(['start-sit', 'dfs', 'draft-strategy', 'draft-assistant']);

interface HubTabBarProps {
    leagueId:         string;
    activeTab:        HubTabKey;
    onSectionChange?: (tab: HubTabKey) => void;
}

export default function HubTabBar({ leagueId, activeTab, onSectionChange }: HubTabBarProps) {
    const router = useRouter();
    const base   = `/dashboard/league/${leagueId}/fantasyiq`;

    function routeHref(key: HubTabKey) {
        if (key === 'start-sit')        return `${base}/start-sit`;
        if (key === 'dfs')              return `${base}/dfs`;
        if (key === 'draft-strategy')   return `${base}/draft-strategy`;
        if (key === 'draft-assistant')  return `${base}/draft-assistant`;
        return base;
    }

    function handleClick(key: HubTabKey) {
        if (ROUTE_TABS.has(key)) {
            router.push(routeHref(key));
        } else if (onSectionChange) {
            onSectionChange(key);
        } else {
            router.push(base);
        }
    }

    return (
        <div
            className="flex gap-0.5 border-b border-gray-800 overflow-x-auto"
            style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
            {TABS.map(tab => {
                const isActive = tab.key === activeTab;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => handleClick(tab.key)}
                        className={[
                            'shrink-0 px-4 pb-2.5 pt-1 text-sm transition whitespace-nowrap',
                            isActive
                                ? 'font-semibold text-white border-b-2 border-[#D4AF37]'
                                : 'text-gray-500 hover:text-gray-300',
                        ].join(' ')}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
