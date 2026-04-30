'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Tab({ href, label }: { href: string; label: string }) {
    const pathname = usePathname();
    const active   = pathname.startsWith(href);

    return (
        <Link
            href={href}
            className={
                active
                    ? 'font-semibold text-white border-b-2 border-[#C8A951] pb-1 text-sm transition'
                    : 'text-gray-500 hover:text-gray-300 text-sm transition'
            }
        >
            {label}
        </Link>
    );
}

export default function LeagueTabs({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
    return (
        <nav className="flex gap-4 border-b border-gray-800 pb-2">
            <Tab href={`/dashboard/league/${leagueId}/overview`}     label="Overview"  />
            <Tab href={`/dashboard/league/${leagueId}/dues/pay`}         label="Pay Dues"      />
            <Tab href={`/dashboard/league/${leagueId}/trade`}        label="Trades"    />
            <Tab href={`/dashboard/league/${leagueId}/rankings`}     label="Rankings"  />

            {isCommissioner && (
                <Tab href={`/dashboard/league/${leagueId}/commissioner`} label="Commissioner" />
            )}
        </nav>
    );
}
