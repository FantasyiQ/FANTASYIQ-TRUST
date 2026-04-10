import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DocumentsManager from './DocumentsManager';

export default async function LeagueSettingsPage() {
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
                    <h1 className="text-2xl font-bold mt-3">League Settings & Bylaws Manager</h1>
                </div>

                {/* Bylaws & Documents */}
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">League Documents</h2>
                    <p className="text-gray-500 text-sm -mt-2">
                        Add Google Drive, Dropbox, or any shareable link for your rulebook, bylaws, or other league documents.
                    </p>

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

                {/* League Settings — Coming Soon */}
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">League Settings</h2>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                        <div className="text-3xl mb-3">⚙️</div>
                        <div className="inline-flex items-center gap-2 mb-3">
                            <h3 className="font-bold">Settings at a Glance</h3>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold border border-[#C8A951]/50 text-[#C8A951] bg-[#C8A951]/10">
                                Coming Soon
                            </span>
                        </div>
                        <p className="text-gray-500 text-sm leading-relaxed max-w-md mx-auto">
                            Review and compare your league settings across all synced leagues in one place. Spot inconsistencies, benchmark scoring formats, and keep every league running smoothly.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2 justify-center">
                            {['Multi-league comparison', 'Scoring format review', 'Roster config audit'].map(tag => (
                                <span key={tag} className="px-3 py-1.5 bg-gray-800 rounded-lg text-xs text-gray-600">{tag}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
