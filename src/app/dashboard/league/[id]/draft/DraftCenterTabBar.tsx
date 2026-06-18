'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ALL_TABS = [
    { key: 'strategy',  label: 'Draft Board',  path: 'strategy',  dynastyOnly: true  },
    { key: 'mock',      label: 'Mock Draft',   path: 'mock',      dynastyOnly: false },
    { key: 'assistant', label: 'Live Draft',   path: 'assistant', dynastyOnly: false },
    { key: 'report',    label: 'Draft Report', path: 'report',    dynastyOnly: false },
] as const;

export default function DraftCenterTabBar({ leagueId, isDynasty = true }: { leagueId: string; isDynasty?: boolean }) {
    const pathname = usePathname();
    const base = `/dashboard/league/${leagueId}/draft`;
    const tabs = ALL_TABS.filter(t => !t.dynastyOnly || isDynasty);

    return (
        <div
            className="flex gap-0.5 border-b border-gray-800 overflow-x-auto"
            style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
            {tabs.map(tab => {
                const href     = `${base}/${tab.path}`;
                const isActive = pathname === href || pathname.startsWith(href + '/');
                return (
                    <Link
                        key={tab.key}
                        href={href}
                        className={[
                            'shrink-0 px-4 pb-2.5 pt-1 text-sm transition whitespace-nowrap',
                            isActive
                                ? 'font-semibold text-white border-b-2 border-[#D4AF37]'
                                : 'text-gray-500 hover:text-gray-300',
                        ].join(' ')}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
