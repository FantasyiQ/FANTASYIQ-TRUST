import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DuesManager from './_components/DuesManager';

export const dynamic = 'force-dynamic';

export default async function DuesTrackerPage({ params }: { params: Promise<{ duesId: string }> }) {
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
        include: {
            members:     { orderBy: { createdAt: 'asc' } },
            payoutSpots: { orderBy: { sortOrder: 'asc' } },
            proposals:   { orderBy: { createdAt: 'desc' }, take: 1 },
        },
    });

    if (!dues) notFound();
    if (dues.commissionerId !== user.id) redirect('/dashboard/commissioner/dues');

    const matchedLeague = await prisma.league.findFirst({
        where: {
            userId: user.id,
            leagueName: { equals: dues.leagueName, mode: 'insensitive' },
            season: dues.season,
        },
        select: { leagueId: true },
    });

    return (
        <DuesManager
            duesId={duesId}
            leagueName={dues.leagueName}
            season={dues.season}
            buyInAmount={dues.buyInAmount}
            teamCount={dues.teamCount}
            potTotal={dues.potTotal}
            members={dues.members.map(m => ({
                ...m,
                paidAt: m.paidAt?.toISOString() ?? null,
            }))}
            payoutSpots={dues.payoutSpots}
            hasProposal={dues.proposals.length > 0}
            sleeperLeagueId={matchedLeague?.leagueId ?? null}
        />
    );
}
