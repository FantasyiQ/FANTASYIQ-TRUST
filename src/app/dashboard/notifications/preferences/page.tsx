export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PreferencesForm from '@/components/notifications/PreferencesForm';

export const metadata = { title: 'Notification Preferences — FantasyIQ' };

export default async function NotificationPreferencesPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [prefs, commishCount] = await Promise.all([
        prisma.notificationPreference.findMany({
            where:  { userId: session.user.id },
            select: { type: true, email: true, inApp: true },
        }),
        prisma.leagueDues.count({ where: { commissionerId: session.user.id } }),
    ]);

    const isCommissioner = commishCount > 0;

    return (
        <main className="min-h-screen bg-gray-950 pt-20 pb-16">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/notifications" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Notifications
                    </Link>
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Notification Preferences</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Choose how and when FantasyIQ contacts you. Changes take effect immediately.
                    </p>
                </div>

                <PreferencesForm initialPrefs={prefs} isCommissioner={isCommissioner} />
            </div>
        </main>
    );
}
