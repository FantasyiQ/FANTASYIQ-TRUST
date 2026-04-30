export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import InviteMembers from './InviteMembers';
import BackToOverview from '../../_components/BackToOverview';

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: { id: true, userId: true, leagueId: true, leagueName: true, season: true },
    });

    if (!league || league.userId !== session.user.id) redirect('/dashboard');

    const existing = await prisma.leagueInvite.findFirst({
        where:  { sleeperLeagueId: league.leagueId, season: league.season },
        select: { token: true },
    });

    return (
        <div className="space-y-4">
            <BackToOverview leagueId={id} />
            <InviteMembers
                leagueId={league.id}
                sleeperLeagueId={league.leagueId}
                leagueName={league.leagueName}
                season={league.season}
                existingToken={existing?.token ?? null}
            />
        </div>
    );
}
