export const dynamic = 'force-dynamic';

import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import StartSitAdvisor from '../../start-sit/StartSitAdvisor';
import HubTabBar       from '../HubTabBar';

export default async function HubStartSitPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: { id: true, userId: true, scoringType: true, platform: true, leagueName: true, draftType: true },
    });

    if (!league || league.userId !== session.user.id) notFound();

    const nflState = await getNflState();

    return (
        <div className="space-y-6">

            {/* Hub header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>

                </div>
            </div>

            {/* Tab bar */}
            <HubTabBar leagueId={id} activeTab="start-sit" />

            {/* Start/Sit content */}
            <div className="max-w-2xl">
                <StartSitAdvisor
                    leagueId={id}
                    week={nflState.week}
                    scoringType={league.scoringType ?? null}
                />
            </div>
        </div>
    );
}
