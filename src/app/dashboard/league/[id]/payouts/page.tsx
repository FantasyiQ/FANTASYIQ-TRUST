export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PayoutsManager from './PayoutsManager';

export default async function PayoutsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    // Find the synced league record to get leagueName + season
    const league = await prisma.league.findUnique({
        where:  { id },
        select: { id: true, userId: true, leagueName: true, season: true },
    });
    if (!league || league.userId !== session.user.id) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
                <p className="text-gray-400">League not found.</p>
            </div>
        );
    }

    const dues = await prisma.leagueDues.findFirst({
        where: {
            leagueName: { equals: league.leagueName, mode: 'insensitive' },
            season:     league.season,
        },
        select: {
            id:            true,
            commissionerId: true,
            payoutSpots: {
                select:  { label: true, amount: true, sortOrder: true },
                orderBy: { sortOrder: 'asc' },
            },
            winners: {
                select:  { rank: true, teamName: true, displayName: true, amount: true, paidOut: true, paidAt: true },
                orderBy: { rank: 'asc' },
            },
        },
    });

    if (!dues) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
                <p className="text-gray-400">No dues tracker found for this league.</p>
            </div>
        );
    }

    if (dues.commissionerId !== session.user.id) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm text-center space-y-3">
                    <p className="text-2xl">🔒</p>
                    <p className="font-semibold text-white">Commissioner Access Only</p>
                    <p className="text-gray-400 text-sm">Only the league commissioner can record payouts.</p>
                </div>
            </div>
        );
    }

    const payoutSpots = dues.payoutSpots.map(s => ({
        label:     s.label,
        amount:    s.amount,
        sortOrder: s.sortOrder,
    }));

    const existingWinners = dues.winners.map(w => ({
        rank:        w.rank,
        teamName:    w.teamName,
        displayName: w.displayName ?? null,
        amount:      w.amount,
        paidOut:     w.paidOut,
        paidAt:      w.paidAt?.toISOString() ?? null,
    }));

    return (
        <PayoutsManager
            duesId={dues.id}
            leagueId={id}
            payoutSpots={payoutSpots}
            existingWinners={existingWinners}
            leagueName={league.leagueName}
        />
    );
}
