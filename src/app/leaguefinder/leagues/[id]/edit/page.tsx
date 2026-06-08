export const dynamic = 'force-dynamic';

import { redirect, notFound } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link       from 'next/link';
import EditLeagueForm from './_EditLeagueForm';

export default async function EditLeaguePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id }  = await params;
    const session = await auth();
    if (!session?.user) redirect('/sign-in');

    const league = await prisma.lFLeague.findUnique({
        where:   { id },
        include: { commissioner: { select: { ownerId: true } } },
    });

    if (!league) notFound();
    if (league.commissioner.ownerId !== session.user.id) {
        redirect(`/leaguefinder/leagues/${id}`);
    }

    // activityScore is stored as 20/40/60/80/100; convert back to 1-5
    const activityLevel = league.activityScore > 0 ? Math.round(league.activityScore / 20) : 3;

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

                <div>
                    <nav className="text-xs text-gray-600 flex items-center gap-1.5 mb-4">
                        <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                        <span>/</span>
                        <Link href={`/leaguefinder/leagues/${id}`} className="hover:text-gray-400 transition">{league.name}</Link>
                        <span>/</span>
                        <span className="text-white">Edit</span>
                    </nav>
                    <h1 className="text-2xl font-bold text-white">Edit Listing</h1>
                    <p className="text-sm text-gray-500 mt-1">Changes are reflected on the public league page immediately.</p>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                    <EditLeagueForm
                        leagueId={id}
                        initialName={league.name}
                        initialPlatform={league.platform}
                        initialFormat={league.format}
                        initialScoring={league.scoring}
                        initialSize={league.size}
                        initialBuyIn={league.buyIn}
                        initialSeasons={league.completedSeasons}
                        initialActivity={activityLevel}
                        initialMinPrs={league.requiresMinPrs}
                    />
                </div>
            </div>
        </div>
    );
}
