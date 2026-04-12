import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DocumentsManager from './DocumentsManager';
import AnnouncementBoard from './AnnouncementBoard';

export default async function AnnouncementsPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            subscriptions: {
                where: { type: 'commissioner', status: { in: ['active', 'trialing'] } },
                select: {
                    leagueDues: {
                        select: {
                            id: true,
                            leagueName: true,
                            documents: {
                                select: { id: true, label: true, url: true, createdAt: true },
                                orderBy: { createdAt: 'asc' },
                            },
                            announcements: {
                                orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
                                include: { author: { select: { name: true, image: true } } },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    const leagues = user.subscriptions
        .filter(s => s.leagueDues)
        .map(s => s.leagueDues!);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-10">
                <div>
                    <Link href="/dashboard/commissioner" className="text-gray-500 hover:text-gray-300 text-sm transition">
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
                        <h2 className="text-lg font-bold mb-2">No League Tracker Set Up</h2>
                        <p className="text-gray-400 text-sm mb-6">You need a League Dues tracker to use announcements.</p>
                        <Link href="/dashboard/commissioner/dues"
                            className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-6 py-2.5 rounded-lg transition text-sm">
                            Go to Dues Tracker
                        </Link>
                    </div>
                ) : (
                    leagues.map(league => (
                        <div key={league.id} className="space-y-8">
                            {/* Announcements */}
                            <div className="space-y-4">
                                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                                    Announcements — {league.leagueName}
                                </h2>
                                <AnnouncementBoard
                                    duesId={league.id}
                                    leagueName={league.leagueName}
                                    initial={league.announcements}
                                />
                            </div>

                            {/* Documents */}
                            <div className="space-y-4">
                                <div>
                                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">League Documents</h2>
                                    <p className="text-gray-500 text-xs mt-1">
                                        Rulebook, bylaws, or any shareable link (Google Drive, Dropbox, etc.)
                                    </p>
                                </div>
                                <DocumentsManager
                                    duesId={league.id}
                                    leagueName={league.leagueName}
                                    initialDocuments={league.documents}
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </main>
    );
}
