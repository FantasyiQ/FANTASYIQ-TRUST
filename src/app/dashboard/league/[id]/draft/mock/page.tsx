export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

import { redirect } from 'next/navigation';
import { auth }     from '@/lib/auth';
import { prisma }   from '@/lib/prisma';
import DraftCenterTabBar from '../DraftCenterTabBar';
import MockDraftClient   from './MockDraftClient';

export default async function MockDraftPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: { id: true, userId: true, leagueName: true, leagueType: true },
    });

    if (!league || league.userId !== session.user.id) redirect('/dashboard');

    return (
        <div className="space-y-0">
            <DraftCenterTabBar leagueId={id} />
            <div className="pt-6">
                <MockDraftClient leagueId={id} leagueName={league.leagueName ?? 'My League'} />
            </div>
        </div>
    );
}
