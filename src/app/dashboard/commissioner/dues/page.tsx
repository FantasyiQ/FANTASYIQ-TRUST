import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function DuesPage() {
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
                        <h1 className="text-2xl font-bold">League Dues & Payout Tracker</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border border-[#C8A951]/50 text-[#C8A951] bg-[#C8A951]/10">
                            Coming Soon
                        </span>
                    </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                    <div className="text-4xl mb-4">💰</div>
                    <h2 className="text-xl font-bold mb-3">Dues & Payout Tracking</h2>
                    <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
                        Track every dollar in and out of your league. Know exactly who has paid, who owes, and where every dollar goes — all without touching a cent.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3 justify-center text-sm text-gray-600">
                        <span className="px-3 py-1.5 bg-gray-800 rounded-lg">Payment tracking</span>
                        <span className="px-3 py-1.5 bg-gray-800 rounded-lg">Payout scheduling</span>
                        <span className="px-3 py-1.5 bg-gray-800 rounded-lg">Audit trail</span>
                    </div>
                </div>
            </div>
        </main>
    );
}
