'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
    { key: 'strategy',  label: 'Draft Board',   path: 'strategy'  },
    { key: 'assistant', label: 'Live Draft',     path: 'assistant' },
    { key: 'report',    label: 'Draft Report',   path: 'report'    },
    { key: 'mock',      label: 'Mock Draft',     path: 'mock'      },
] as const;

export default function DraftCenterTabBar({ leagueId }: { leagueId: string }) {
    const pathname = usePathname();
    const base = `/dashboard/league/${leagueId}/draft`;

    return (
        <div
            className="flex gap-0.5 border-b border-gray-800 overflow-x-auto"
            style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
            {TABS.map(tab => {
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
