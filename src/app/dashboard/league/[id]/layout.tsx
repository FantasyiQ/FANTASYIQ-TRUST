import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import LeagueHeader from '@/components/league/LeagueHeader';
import LeagueTabs from '@/components/league/LeagueTabs';

export default async function LeagueLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params:   Promise<{ id: string }>;
}) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: { userId: true, sleeperUserId: true },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { sleeperUserId: true },
        }),
    ]);
    if (!league || league.userId !== session.user.id) redirect('/dashboard');

    // Commissioner = the Sleeper user who owns the league
    const mySleeperUserId    = dbUser?.sleeperUserId ?? null;
    const leagueSleeperOwner = league.sleeperUserId ?? null;
    const isCommissioner     = !!mySleeperUserId && !!leagueSleeperOwner
        && String(mySleeperUserId).trim() === String(leagueSleeperOwner).trim();

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="flex flex-col gap-6 max-w-5xl mx-auto">
                <LeagueHeader leagueId={id} />
                <LeagueTabs leagueId={id} isCommissioner={isCommissioner} />
                <div className="mt-4">
                    {children}
                </div>
            </div>
        </main>
    );
}
