'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
    { name: 'Overview',     href: (id: string) => `/dashboard/league/${id}/overview`,     commissionerOnly: false },
    { name: 'Commissioner', href: (id: string) => `/dashboard/league/${id}/commissioner`, commissionerOnly: true  },
    { name: 'Dues',         href: (id: string) => `/dashboard/league/${id}/dues`,         commissionerOnly: false },
    { name: 'Calendar',     href: (id: string) => `/dashboard/league/${id}/calendar`,     commissionerOnly: false },
    { name: 'Trade',        href: (id: string) => `/dashboard/league/${id}/trade`,        commissionerOnly: false },
    { name: 'Rankings',     href: (id: string) => `/dashboard/league/${id}/rankings`,     commissionerOnly: false },
];

export default function LeagueTabs({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
    const pathname = usePathname();

    const visibleTabs = TABS.filter(tab => !tab.commissionerOnly || isCommissioner);

    return (
        <div className="flex gap-4 border-b border-gray-800 pb-2">
            {visibleTabs.map(tab => {
                const href   = tab.href(leagueId);
                const active = pathname.startsWith(href);
                return (
                    <Link
                        key={tab.href(leagueId)}
                        href={href}
                        className={
                            active
                                ? 'font-semibold text-white border-b-2 border-[#C8A951] pb-1 text-sm transition'
                                : 'text-gray-500 hover:text-gray-300 text-sm transition'
                        }
                    >
                        {tab.name}
                    </Link>
                );
            })}
        </div>
    );
}
