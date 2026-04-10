import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function LeagueSettingsPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <Link href="/dashboard/commissioner" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <div className="flex items-center gap-3 mt-3">
                        <h1 className="text-2xl font-bold">League Settings Manager</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border border-[#C8A951]/50 text-[#C8A951] bg-[#C8A951]/10">
                            Coming Soon
                        </span>
                    </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                    <div className="text-4xl mb-4">⚙️</div>
                    <h2 className="text-xl font-bold mb-3">Settings at a Glance</h2>
                    <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
                        Review and compare your league settings across all synced leagues in one place. Spot inconsistencies, benchmark scoring formats, and keep every league running smoothly.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3 justify-center text-sm text-gray-600">
                        <span className="px-3 py-1.5 bg-gray-800 rounded-lg">Multi-league comparison</span>
                        <span className="px-3 py-1.5 bg-gray-800 rounded-lg">Scoring format review</span>
                        <span className="px-3 py-1.5 bg-gray-800 rounded-lg">Roster config audit</span>
                    </div>
                </div>
            </div>
        </main>
    );
}
