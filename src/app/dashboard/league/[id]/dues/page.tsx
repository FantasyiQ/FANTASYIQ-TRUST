export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { getLeagueDues } from '@/lib/league/getLeagueDues';
import LeagueDuesView from '@/components/league/LeagueDuesView';
import PayoutsWinnersCard from './PayoutsWinnersCard';

export default async function DuesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const [data, leaguePayouts, leaguePayoutWinners] = await Promise.all([
        getLeagueDues(id),
        prisma.leaguePayout.findMany({
            where:   { leagueId: id },
            orderBy: { rank: 'asc' },
        }),
        prisma.leaguePayoutWinner.findMany({
            where:   { leagueId: id },
            orderBy: { rank: 'asc' },
        }),
    ]);

    const winnerByRank = new Map(leaguePayoutWinners.map(w => [w.rank, w]));
    const payoutsData  = leaguePayouts.length > 0
        ? leaguePayouts.map(p => ({
            rank:     p.rank,
            amount:   p.amount,
            teamId:   winnerByRank.get(p.rank)?.teamId   ?? '',
            teamName: winnerByRank.get(p.rank)?.teamName ?? '',
            paidAt:   p.paidAt?.toISOString() ?? null,
        }))
        : null;

    return (
        <div className="space-y-6">
            <LeagueDuesView {...data} />
            <PayoutsWinnersCard
                leagueId={id}
                payouts={payoutsData}
                isCommissioner={data.isCommissioner}
                hasPayoutSpots={data.payouts.length > 0}
            />
        </div>
    );
}
