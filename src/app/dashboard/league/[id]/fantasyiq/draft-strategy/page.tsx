export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

import { redirect, notFound } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import HubTabBar  from '../HubTabBar';
import RookieDynastyRankings from './RookieDynastyRankings';

export default async function DraftStrategyPage({
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

    if (!league || league.userId !== session.user.id) notFound();

    const season = league.season ?? '2026';

    const rawPlayers = await prisma.rookieRankingsPlayer.findMany({
        where:   { season },
        orderBy: { fiqScore: 'desc' },
        select: {
            id:          true,
            playerName:  true,
            school:      true,
            position:    true,
            nflGrade:    true,
            fiqGrade:    true,
            eliteScore:  true,
            marketScore: true,
            overallPick: true,
            draftCap:    true,
            fiqScore:    true,
            fiqTier:     true,
        },
    });

    // Enrich with Sleeper player data (image, team, height, weight)
    const names = rawPlayers.map(p => p.playerName);
    const sleeperPlayers = await prisma.sleeperPlayer.findMany({
        where:  { fullName: { in: names } },
        select: { fullName: true, playerId: true, team: true, height: true, weight: true, age: true },
    });

    const sleeperByName = new Map(sleeperPlayers.map(sp => [sp.fullName, sp]));

    const players = rawPlayers.map(p => {
        const sp = sleeperByName.get(p.playerName);
        return {
            ...p,
            playerId: sp?.playerId ?? null,
            team:     sp?.team     ?? null,
            height:   sp?.height   ?? null,
            weight:   sp?.weight   ?? null,
            age:      sp?.age      ?? null,
        };
    });

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>
                </div>
            </div>

            <HubTabBar leagueId={id} activeTab="draft-strategy" />

            <RookieDynastyRankings players={players} season={season} />
        </div>
    );
}
