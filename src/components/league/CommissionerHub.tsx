import Link from 'next/link';
import type { LeagueData } from '@/lib/league/getLeagueData';

export default function CommissionerHub({ league, dues, proBowlContest }: LeagueData) {
    const TOOLS = [
        {
            label:       'Dues Manager',
            description: dues
                ? 'Manage buy-ins, mark payments, and set payout structure.'
                : 'Set up dues tracking for this league.',
            href: dues
                ? `/dashboard/commissioner/dues/${dues.id}`
                : '/dashboard/commissioner/dues/setup',
            cta: dues ? 'Manage Dues →' : 'Set Up Dues →',
        },
        {
            label:       'Announcements Manager',
            description: 'Post updates and pin important messages for your league.',
            href:        '/dashboard/commissioner/announcements',
            cta:         'Manage Announcements →',
        },
        {
            label:       'Calendar Manager',
            description: 'Add key dates — draft, trade deadline, playoffs, championship.',
            href:        `/dashboard/commissioner/calendar/${league.id}`,
            cta:         'Manage Calendar →',
        },
        {
            label:       'Pro Bowl Manager',
            description: proBowlContest
                ? `Active contest: ${proBowlContest.name}`
                : 'Create a Pro Bowl fantasy contest for your league.',
            href: proBowlContest
                ? `/dashboard/commissioner/pro-bowl/${proBowlContest.id}`
                : `/dashboard/commissioner/pro-bowl/create?leagueId=${league.id}`,
            cta: proBowlContest ? 'Manage Contest →' : 'Create Contest →',
        },
        {
            label:       'Invite Members',
            description: 'Generate an invite link to bring league members into FantasyIQ.',
            href:        `/dashboard/league/${league.id}/commissioner/invite`,
            cta:         'Invite Members →',
        },
        {
            label:       'Commissioner Settings',
            description: 'Review and manage league settings, scoring, and roster config.',
            href:        '/dashboard/commissioner/settings',
            cta:         'View Settings →',
        },
    ];

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold">Commissioner Tools</h2>
                <p className="text-gray-500 text-sm mt-0.5">{league.leagueName} · {league.season}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
                {TOOLS.map(tool => (
                    <div key={tool.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
                        <div className="flex-1">
                            <p className="font-semibold text-white">{tool.label}</p>
                            <p className="text-gray-500 text-sm mt-1">{tool.description}</p>
                        </div>
                        <Link href={tool.href} className="self-start text-sm font-medium text-[#C8A951] hover:underline">
                            {tool.cta}
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
}
