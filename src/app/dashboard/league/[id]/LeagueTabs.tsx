'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
    { label: 'Overview',  href: (id: string) => `/dashboard/league/${id}/overview`  },
    { label: 'Dues',      href: (id: string) => `/dashboard/league/${id}/dues`      },
    { label: 'Calendar',  href: (id: string) => `/dashboard/league/${id}/calendar`  },
];

export default function LeagueTabs({ leagueId }: { leagueId: string }) {
    const pathname = usePathname();

    return (
        <div className="flex gap-1 border-b border-gray-800 pb-0">
            {TABS.map(tab => {
                const href   = tab.href(leagueId);
                const active = pathname === href || pathname.startsWith(href + '/');
                return (
                    <Link
                        key={tab.label}
                        href={href}
                        className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition border-b-2 -mb-px ${
                            active
                                ? 'text-white border-[#C8A951]'
                                : 'text-gray-500 border-transparent hover:text-gray-300'
                        }`}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
