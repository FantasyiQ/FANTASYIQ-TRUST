import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DuesSetupForm from './DuesSetupForm';

export default async function DuesSetupPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const sp       = await searchParams;
    const leagueId = typeof sp.leagueId === 'string' ? sp.leagueId : null;

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            leagues: {
                orderBy: { leagueName: 'asc' },
                select: { id: true, leagueName: true, totalRosters: true, season: true, platform: true },
            },
        },
    });

    // Deduplicate: one entry per league name (highest season wins)
    const _seen = new Map<string, NonNullable<typeof user>['leagues'][0]>();
    for (const l of user?.leagues ?? []) {
        const key = l.leagueName.toLowerCase().trim();
        const ex  = _seen.get(key);
        if (!ex || l.season > ex.season) _seen.set(key, l);
    }
    const syncedLeagues = [..._seen.values()].sort((a, b) => a.leagueName.localeCompare(b.leagueName));

    const backHref  = leagueId ? `/dashboard/league/${leagueId}/commissioner` : '/dashboard/commissioner/dues';
    const backLabel = leagueId ? '← Back to Commissioner Hub' : '← Back to Dues Tracker';

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-lg mx-auto space-y-6">
                <div>
                    <Link href={backHref} className="text-gray-500 hover:text-gray-300 text-sm transition">
                        {backLabel}
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Set Up League Tracker</h1>
                    <p className="text-gray-400 text-sm mt-1">Configure your buy-in and pot for this league.</p>
                </div>
                <Suspense fallback={<div className="text-gray-500 text-sm">Loading...</div>}>
                    <DuesSetupForm syncedLeagues={syncedLeagues} />
                </Suspense>
            </div>
        </main>
    );
}
