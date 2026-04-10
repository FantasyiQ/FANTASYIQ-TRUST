import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DocumentsManager from './DocumentsManager';

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
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <Link href="/dashboard/commissioner" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Commissioner Announcements</h1>
                </div>

                {/* League Documents / Rulebooks */}
                <div className="space-y-4">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">League Documents</h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Store your rulebook, bylaws, or any league document. Add a Google Drive, Dropbox, or any shareable link.
                        </p>
                    </div>

                    {leagues.length === 0 ? (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                            <p className="text-gray-500 text-sm">You need a League Dues tracker set up first.</p>
                            <Link href="/dashboard/commissioner/dues"
                                className="inline-block mt-4 bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-5 py-2 rounded-lg text-sm transition">
                                Go to Dues Tracker
                            </Link>
                        </div>
                    ) : (
                        leagues.map(league => (
                            <DocumentsManager
                                key={league.id}
                                duesId={league.id}
                                leagueName={league.leagueName}
                                initialDocuments={league.documents}
                            />
                        ))
                    )}
                </div>

                {/* Announcements — Coming Soon */}
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Announcements</h2>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                        <div className="text-4xl mb-4">📣</div>
                        <div className="inline-flex items-center gap-2 mb-3">
                            <h3 className="font-bold text-lg">Keep Your League Informed</h3>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold border border-[#C8A951]/50 text-[#C8A951] bg-[#C8A951]/10">
                                Coming Soon
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
                            Draft and send league announcements to keep your managers in the loop. Rule changes, trade vetoes, playoff formats — communicate everything from one place.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3 justify-center">
                            {['League messaging', 'Rule announcements', 'Manager notifications'].map(tag => (
                                <span key={tag} className="px-3 py-1.5 bg-gray-800 rounded-lg text-xs text-gray-600">{tag}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
