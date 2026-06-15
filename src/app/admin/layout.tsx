import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

const NAV = [
    { href: '/admin',              label: 'Overview',       icon: '📊' },
    { href: '/admin/users',        label: 'Users',          icon: '👤' },
    { href: '/admin/revenue',      label: 'Revenue',        icon: '💰' },
    { href: '/admin/dues',         label: 'Dues Flow',      icon: '🏦' },
    { href: '/admin/leagues',      label: 'Leagues',        icon: '🏈' },
    { href: '/admin/commissioners',label: 'Commissioners',  icon: '🏆' },
    { href: '/admin/features',     label: 'Feature Usage',  icon: '🔥' },
    { href: '/admin/emails',       label: 'Email Delivery', icon: '📧' },
    { href: '/admin/crons',        label: 'Cron Logs',      icon: '⚙️'  },
    { href: '/admin/webhooks',     label: 'Webhooks',       icon: '🔗' },
    { href: '/admin/churn',        label: 'Churn Risk',     icon: '⚠️'  },
    { href: '/admin/upsell',       label: 'Upsell',         icon: '📈' },
    { href: '/admin/health',       label: 'League Health',  icon: '🏥' },
    { href: '/admin/predictions',      label: 'Predictions',    icon: '🧠' },
    { href: '/admin/messaging',        label: 'Messaging',      icon: '📬' },
    { href: '/admin/rookie-rankings',  label: 'Rookie Ratings', icon: '🎯' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    // Always query DB for isAdmin — never trust stale JWT for admin access
    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { isAdmin: true, email: true },
    });

    if (!user?.isAdmin) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm text-center space-y-3">
                    <p className="text-3xl">🔒</p>
                    <p className="font-semibold text-white">Admin access required</p>
                    <p className="text-gray-500 text-sm">Your account doesn&apos;t have admin privileges.</p>
                    <Link href="/dashboard" className="inline-block mt-2 text-sm text-[#D4AF37] hover:underline">
                        ← Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white flex">
            {/* Sidebar */}
            <aside className="w-56 shrink-0 border-r border-gray-800 flex flex-col pt-8 pb-6 px-4 sticky top-0 h-screen">
                <div className="mb-8 px-2">
                    <p className="text-[10px] font-black tracking-widest text-gray-600 normal-case mb-0.5">FiQ</p>
                    <p className="text-sm font-bold text-white">Admin IDS</p>
                    <p className="text-[10px] text-gray-600 truncate mt-0.5">{user.email}</p>
                </div>

                <nav className="flex-1 space-y-0.5">
                    {NAV.map(({ href, label, icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
                        >
                            <span className="text-base">{icon}</span>
                            {label}
                        </Link>
                    ))}
                </nav>

                <div className="pt-4 border-t border-gray-800 px-2">
                    <Link href="/dashboard" className="text-[11px] text-gray-600 hover:text-gray-400 transition">
                        ← Back to FiQ
                    </Link>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 min-w-0 py-8 px-8 overflow-auto">
                {children}
            </main>
        </div>
    );
}
