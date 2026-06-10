import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getLeagueById } from '@/lib/db/leagues';
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

    const user   = await getCurrentUser();
    const league = await getLeagueById(id, user.id);

    if (!league) {
        // User doesn't own this league — check if it exists and has a commissioner plan
        const rawLeague = await prisma.league.findUnique({
            where:  { id },
            select: { leagueName: true, assignedPlanType: true },
        });

        if (!rawLeague) redirect('/dashboard');

        if (rawLeague.assignedPlanType === 'commissioner') {
            return (
                <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6 py-16">
                    <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-4">
                        <p className="text-4xl">🏈</p>
                        <h2 className="text-xl font-bold text-white">Commissioner Plan Active</h2>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            <span className="text-white font-semibold">{rawLeague.leagueName}</span> is covered by a commissioner plan.
                            Ask your commissioner to send you an invite link to get access — no player plan required.
                        </p>
                        <Link
                            href="/dashboard"
                            className="inline-block text-[#D4AF37] hover:underline text-sm font-medium mt-2"
                        >
                            ← Back to Dashboard
                        </Link>
                    </div>
                </main>
            );
        }

        // No commissioner plan — guide them to purchase a player plan
        redirect('/pricing?tab=player');
    }

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
