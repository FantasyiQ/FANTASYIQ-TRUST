import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

const FEATURES = [
    {
        href:        '/dashboard/commissioner/dues',
        icon:        '💰',
        title:       'League Dues & Payout Tracker',
        description: 'Track every dollar in and out. Know exactly who\'s paid, who owes, and where the money goes.',
    },
    {
        href:        '/dashboard/commissioner/pro-bowl',
        icon:        '🏈',
        title:       'Pro Bowl Contest',
        description: 'Week 18 free contest — DraftKings-style lineup picks, no salary cap. Open to all league members.',
    },
    {
        href:        '/dashboard/commissioner/settings',
        icon:        '⚙️',
        title:       'League Settings Manager',
        description: 'Review and compare your league settings across all synced leagues in one place.',
    },
    {
        href:        '/dashboard/commissioner/calendar',
        icon:        '📅',
        title:       'Season Calendar',
        description: 'Key dates, trade deadlines, and playoff schedules — all in one view.',
    },
    {
        href:        '/dashboard/commissioner/announcements',
        icon:        '📣',
        title:       'Commissioner Announcements',
        description: 'Draft and send league announcements to keep your managers in the loop.',
    },
] as const;

export default async function CommissionerHubPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Header */}
                <div>
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-3xl font-bold mt-3">Commissioner Hub</h1>
                    <p className="text-gray-400 mt-1">Manage your league like a pro.</p>
                </div>

                {/* Feature cards */}
                <div className="grid sm:grid-cols-2 gap-4">
                    {FEATURES.map((f) => (
                        <Link
                            key={f.href}
                            href={f.href}
                            className="group bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-2xl p-6 transition"
                        >
                            <div className="text-3xl mb-3">{f.icon}</div>
                            <h2 className="text-lg font-bold text-white group-hover:text-[#C8A951] transition mb-2">
                                {f.title}
                            </h2>
                            <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
                            <div className="mt-4 flex items-center gap-1 text-[#C8A951] text-sm font-semibold opacity-0 group-hover:opacity-100 transition">
                                Open <span>→</span>
                            </div>
                        </Link>
                    ))}
                </div>

            </div>
        </main>
    );
}
