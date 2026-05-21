import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AccountSettings from './AccountSettings';

export const metadata: Metadata = {
    title: 'Account — FantasyIQ Trust',
    robots: { index: false },
};

export default async function AccountPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { name: true, email: true, emailVerified: true, hashedPassword: true },
    });
    if (!user) redirect('/sign-in');

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto space-y-6">

                <div>
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Account Settings</h1>
                    <p className="text-gray-400 text-sm mt-1">Manage your profile and personal data.</p>
                </div>

                <AccountSettings
                    name={user.name}
                    email={user.email!}
                    emailVerified={user.emailVerified}
                    hasPassword={!!user.hashedPassword}
                />

            </div>
        </main>
    );
}
