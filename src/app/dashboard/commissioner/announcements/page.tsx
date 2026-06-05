import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DocumentsManager from './DocumentsManager';
import AnnouncementBoard from './AnnouncementBoard';

export default async function AnnouncementsPage({
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
                    id:          true,
                    leagueName:  true,
                    season:      true,
                    announcements: {
                        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
                        include: { author: { select: { name: true, image: true } } },
                    },
                },
            },
            subscriptions: {
                where:  { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                select: {
                    leagueDues: {
                        select: {
                            id:         true,
                            leagueName: true,
                            documents: {
                                select:  { id: true, label: true, url: true, createdAt: true },
                                orderBy: { createdAt: 'asc' },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    // Deduplicate: keep only the most recent season per league name
    const _seenAnn = new Map<string, typeof user.leagues[0]>();
    for (const l of user.leagues) {
        const key = l.leagueName.toLowerCase().trim();
        const ex  = _seenAnn.get(key);
        if (!ex || l.season > ex.season) _seenAnn.set(key, l);
    }
    const leagues = [..._seenAnn.values()].sort((a, b) => a.leagueName.localeCompare(b.leagueName));

    // Build a map of leagueName → documents from dues tracker (still dues-linked)
    const docsByLeagueName = new Map<string, { id: string; label: string; url: string; createdAt: Date }[]>();
    const duesIdByLeagueName = new Map<string, string>();
    for (const sub of user.subscriptions) {
        if (sub.leagueDues) {
            const name = sub.leagueDues.leagueName.toLowerCase();
            docsByLeagueName.set(name, sub.leagueDues.documents);
            duesIdByLeagueName.set(name, sub.leagueDues.id);
        }
    }

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-10">
                <div>
                    <Link
                        href={contextLeagueId ? `/dashboard/league/${contextLeagueId}/commissioner` : '/dashboard/commissioner'}
                        className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Commissioner Announcements</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Post updates to your league — rule changes, trade vetoes, memes. Pin the important ones.
                    </p>
                </div>

                {leagues.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                        <div className="text-4xl mb-4">📣</div>
                        <h2 className="text-lg font-bold mb-2">No Leagues Synced</h2>
                        <p className="text-gray-400 text-sm mb-6">Sync a league first to start posting announcements.</p>
                        <Link href="/dashboard/sync"
                            className="inline-block bg-[#D4AF37] hover:bg-[#BF9D2F] text-black font-bold px-6 py-2.5 rounded-lg transition text-sm">
                            Sync a League
                        </Link>
                    </div>
                ) : (
                    leagues.map(league => {
                        const docs    = docsByLeagueName.get(league.leagueName.toLowerCase()) ?? [];
                        const duesId  = duesIdByLeagueName.get(league.leagueName.toLowerCase()) ?? null;
                        return (
                            <div key={league.id} className="space-y-8">
                                {/* Announcements */}
                                <div className="space-y-4">
                                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                                        Announcements — {league.leagueName}
                                    </h2>
                                    <AnnouncementBoard
                                        leagueId={league.id}
                                        leagueName={league.leagueName}
                                        initial={league.announcements}
                                    />
                                </div>

                                {/* Documents — still dues-linked, shown only when dues tracker exists */}
                                {duesId && docs.length >= 0 && (
                                    <div className="space-y-4">
                                        <div>
                                            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">League Documents</h2>
                                            <p className="text-gray-500 text-xs mt-1">
                                                Rulebook, bylaws, or any shareable link (Google Drive, Dropbox, etc.)
                                            </p>
                                        </div>
                                        <DocumentsManager
                                            duesId={duesId}
                                            leagueName={league.leagueName}
                                            initialDocuments={docs}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </main>
    );
}
