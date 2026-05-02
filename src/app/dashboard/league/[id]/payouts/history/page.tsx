export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PayoutsHistory from './PayoutsHistory';

export default async function PayoutsHistoryPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: { id: true, userId: true, leagueName: true, season: true },
    });

    if (!league || league.userId !== session.user.id) {
        redirect(`/dashboard/league/${id}/overview`);
    }

    const [payouts, winners] = await Promise.all([
        prisma.leaguePayout.findMany({
            where:   { leagueId: id },
            orderBy: { rank: 'asc' },
        }),
        prisma.leaguePayoutWinner.findMany({
            where:   { leagueId: id },
            orderBy: { rank: 'asc' },
        }),
    ]);

    const winnerByRank = new Map(winners.map(w => [w.rank, w]));

    const rows = payouts.map(p => ({
        rank:     p.rank,
        amount:   p.amount,
        teamName: winnerByRank.get(p.rank)?.teamName ?? '—',
        paidAt:   p.paidAt?.toISOString() ?? null,
        paidBy:   p.paidBy,
        season:   league.season,
    }));

    return (
        <PayoutsHistory
            leagueId={id}
            leagueName={league.leagueName}
            season={league.season}
            rows={rows}
        />
    );
}
