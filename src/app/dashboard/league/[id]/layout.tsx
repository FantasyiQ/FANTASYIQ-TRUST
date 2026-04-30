import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getLeagueById } from '@/lib/db/leagues';
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

    const user   = await getCurrentUser();
    const league = await getLeagueById(id, user.id);

    if (!league) redirect('/dashboard');

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="flex flex-col gap-6 max-w-5xl mx-auto">
                <LeagueHeader leagueId={id} />
                <LeagueTabs leagueId={id} isCommissioner={league.isCommissioner} />
                <div className="mt-6">
                    {children}
                </div>
            </div>
        </main>
    );
}
