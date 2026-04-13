import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import FutureDuesClient from './FutureDuesClient';

export default async function FutureDuesPage({ params }: { params: Promise<{ duesId: string }> }) {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) redirect('/sign-in');

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: {
            commissionerId: true,
            leagueName:     true,
            season:         true,
            buyInAmount:    true,
            members: {
                select: { id: true, displayName: true, teamName: true },
                orderBy: { displayName: 'asc' },
            },
            futureDues: {
                orderBy: [{ season: 'asc' }, { createdAt: 'asc' }],
                include: { member: { select: { displayName: true, teamName: true } } },
            },
        },
    });

    if (!dues) notFound();
    if (dues.commissionerId !== user.id) redirect('/dashboard/commissioner/dues');

    // Fetch any follow-on trackers for the same league+commissioner (future seasons)
    const baseYear = parseInt(dues.season) || new Date().getFullYear();
    const futureSeasonsToCheck = [String(baseYear + 1), String(baseYear + 2), String(baseYear + 3)];
    const followOnTrackers = await prisma.leagueDues.findMany({
        where: {
            commissionerId: user.id,
            leagueName: dues.leagueName,
            season: { in: futureSeasonsToCheck },
        },
        select: { id: true, season: true },
    });
    const futureTrackers = followOnTrackers.map(t => ({ id: t.id, season: t.season }));

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-6">

                <div>
                    <Link href={`/dashboard/commissioner/dues/${duesId}`}
                        className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to {dues.leagueName}
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Future Dues</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Track teams who traded away future draft picks and owe dues in upcoming seasons.
                    </p>
                </div>

                <FutureDuesClient
                    duesId={duesId}
                    currentSeason={dues.season}
                    buyInAmount={dues.buyInAmount}
                    members={dues.members}
                    obligations={dues.futureDues}
                    futureTrackers={futureTrackers}
                />

            </div>
        </main>
    );
}
