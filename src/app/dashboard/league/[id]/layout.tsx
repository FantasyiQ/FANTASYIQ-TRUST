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

    // Ownership check — LeagueHeader fetches its own display data
    const league = await prisma.league.findUnique({
        where:  { id },
        select: { userId: true },
    });
    if (!league || league.userId !== session.user.id) redirect('/dashboard');

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="flex flex-col gap-6 max-w-5xl mx-auto">
                <LeagueHeader leagueId={id} />
                <LeagueTabs leagueId={id} />
                <div className="mt-4">
                    {children}
                </div>
            </div>
        </main>
    );
}
