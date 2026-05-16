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
        select: { id: true, userId: true, leagueName: true, season: true, rosterPositions: true },
    });

    if (!league || league.userId !== session.user.id) notFound();

    const season = league.season ?? '2026';

    const IDP_SLOTS = new Set(['DL','DE','DT','NT','LB','OLB','ILB','MLB','DB','CB','S','FS','SS','NB','IDP','IDPFLEX','IDP_FLEX']);
    const hasIDP = (league.rosterPositions ?? []).some(pos => IDP_SLOTS.has(pos));

    const rawPlayers = await prisma.rookieRankingsPlayer.findMany({
        where:   { season },
        orderBy: { fiqScore: 'desc' },
        select: {
            id:               true,
            playerName:       true,
            school:           true,
            position:         true,
            nflGrade:         true,
            fiqGrade:         true,
            eliteScore:       true,
            marketScore:      true,
            overallPick:      true,
            draftCap:         true,
            baseFiQScore:     true,
            opportunityScore: true,
            fiqScore:         true,
            fiqTier:          true,
            height:           true,
            weight:           true,
            fortyTime:        true,
        },
    });

    // Enrich with Sleeper player data (image, team, height, weight)
    const names = rawPlayers.map(p => p.playerName);
    const sleeperPlayers = await prisma.sleeperPlayer.findMany({
        where:  { fullName: { in: names } },
        select: { fullName: true, playerId: true, position: true, team: true, height: true, weight: true, age: true },
    });

    // Build two-level map: name → position → player. When there are multiple
    // Sleeper players with the same name (e.g. two "Chris Johnson"), prefer the
    // one whose position matches the rookie's position.
    const sleeperByNamePos = new Map<string, Map<string, typeof sleeperPlayers[0]>>();
    for (const sp of sleeperPlayers) {
        if (!sleeperByNamePos.has(sp.fullName)) sleeperByNamePos.set(sp.fullName, new Map());
        sleeperByNamePos.get(sp.fullName)!.set(sp.position ?? '', sp);
    }

    const players = rawPlayers.map(p => {
        const byPos = sleeperByNamePos.get(p.playerName);
        // Exact position match first, then any entry for this name
        const sp = byPos?.get(p.position) ?? (byPos?.size === 1 ? byPos.values().next().value : undefined);
        return {
            ...p,
            playerId:        sp?.playerId          ?? null,
            team:            sp?.team              ?? null,
            // Sleeper data takes priority; fall back to manually-seeded combine data
            height:          sp?.height            ?? p.height    ?? null,
            weight:          sp?.weight            ?? p.weight    ?? null,
            age:             sp?.age               ?? null,
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

            <RookieDynastyRankings players={players} season={season} hasIDP={hasIDP} />
        </div>
    );
}
