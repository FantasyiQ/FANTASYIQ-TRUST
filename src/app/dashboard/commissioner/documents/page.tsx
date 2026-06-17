import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DocumentsManager from '../announcements/DocumentsManager';

export default async function DocumentsPage({
    searchParams,
}: {
    searchParams: Promise<{ leagueId?: string }>;
}) {
    const { leagueId: contextLeagueId } = await searchParams;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: {
            id: true,
            leagues: {
                orderBy: { leagueName: 'asc' },
                select: {
                    id:        true,
                    leagueName: true,
                    season:    true,
                    userId:    true,
                    documents: {
                        select:  { id: true, label: true, url: true, createdAt: true },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    // Deduplicate: keep most recent season per league name
    const seen = new Map<string, typeof user.leagues[0]>();
    for (const l of user.leagues) {
        if (l.userId !== user.id) continue; // commissioner-owned only
        const key = l.leagueName.toLowerCase().trim();
        const ex  = seen.get(key);
        if (!ex || l.season > ex.season) seen.set(key, l);
    }
    const allLeagues = [...seen.values()].sort((a, b) => a.leagueName.localeCompare(b.leagueName));
    const leagues    = contextLeagueId
        ? allLeagues.filter(l => l.id === contextLeagueId)
        : allLeagues;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-10">
                <div>
                    <Link
                        href={contextLeagueId ? `/dashboard/league/${contextLeagueId}/commissioner` : '/dashboard/commissioner'}
                        className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">League Documents</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Upload your rulebook, bylaws, or any league files. Members can view them on the league page.
                    </p>
                </div>

                {leagues.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                        <div className="text-4xl mb-4">📁</div>
                        <h2 className="text-lg font-bold mb-2">No Leagues Found</h2>
                        <p className="text-gray-400 text-sm mb-6">Sync a league first to start uploading documents.</p>
                        <Link href="/dashboard/sync"
                            className="inline-block bg-[#D4AF37] hover:bg-[#BF9D2F] text-black font-bold px-6 py-2.5 rounded-lg transition text-sm">
                            Sync a League
                        </Link>
                    </div>
                ) : (
                    leagues.map(league => (
                        <div key={league.id} className="space-y-4">
                            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                                {league.leagueName}
                            </h2>
                            <DocumentsManager
                                leagueId={league.id}
                                leagueName={league.leagueName}
                                initialDocuments={league.documents}
                            />
                        </div>
                    ))
                )}
            </div>
        </main>
    );
}
