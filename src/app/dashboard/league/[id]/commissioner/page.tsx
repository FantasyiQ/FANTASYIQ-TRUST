export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueUsers } from '@/lib/sleeper';

export default async function CommissionerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: {
                id: true, userId: true, leagueId: true, leagueName: true,
                season: true, sleeperUserId: true,
            },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { sleeperUserId: true },
        }),
    ]);

    if (!league || league.userId !== session.user.id) notFound();

    // Commissioner check via Sleeper
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    let isCommissioner = false;
    try {
        const members = await getLeagueUsers(league.leagueId);
        const commId  = members.find(m => m.is_owner)?.user_id;
        isCommissioner = !!commId && !!mySleeperUserId &&
            String(commId).trim() === String(mySleeperUserId).trim();
    } catch { /* Sleeper unreachable */ }

    // Load linked dues record
    const dues = await prisma.leagueDues.findFirst({
        where: {
            leagueName: { equals: league.leagueName, mode: 'insensitive' },
            season:     league.season,
        },
        select: { id: true },
    });

    // Load active pro bowl contest
    const proBowl = await prisma.proBowlContest.findFirst({
        where:   { leagueId: league.id, isActive: true },
        select:  { id: true, name: true },
        orderBy: { createdAt: 'desc' },
    });

    if (!isCommissioner) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-2">
                <p className="text-gray-400 font-medium">Commissioner tools are only available to the league commissioner.</p>
            </div>
        );
    }

    const TOOLS: { label: string; description: string; href: string; cta: string }[] = [
        {
            label:       'Dues &amp; Payouts',
            description: dues
                ? 'Manage buy-ins, mark payments, and set payout structure.'
                : 'Set up dues tracking for this league.',
            href: dues
                ? `/dashboard/commissioner/dues/${dues.id}`
                : '/dashboard/commissioner/dues',
            cta: dues ? 'Manage Dues →' : 'Set Up Dues →',
        },
        {
            label:       'Pro Bowl Contest',
            description: proBowl
                ? `Active contest: ${proBowl.name}`
                : 'Create a Pro Bowl fantasy contest for your league.',
            href: proBowl
                ? `/dashboard/commissioner/pro-bowl/${proBowl.id}`
                : `/dashboard/commissioner/pro-bowl/create?leagueId=${league.id}`,
            cta: proBowl ? 'Manage Contest →' : 'Create Contest →',
        },
        {
            label:       'Season Calendar',
            description: 'Add key dates — draft, trade deadline, playoffs, championship.',
            href:        `/dashboard/commissioner/calendar/${league.id}`,
            cta:         'Manage Calendar →',
        },
        {
            label:       'Announcements',
            description: 'Post updates and pin important messages for your league.',
            href:        dues ? `/dashboard/commissioner/dues/${dues.id}` : '/dashboard/commissioner/dues',
            cta:         dues ? 'Go to Announcements →' : 'Set Up Dues First →',
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
                            <p className="font-semibold text-white" dangerouslySetInnerHTML={{ __html: tool.label }} />
                            <p className="text-gray-500 text-sm mt-1">{tool.description}</p>
                        </div>
                        <Link
                            href={tool.href}
                            className="self-start text-sm font-medium text-[#C8A951] hover:underline"
                        >
                            {tool.cta}
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
}
