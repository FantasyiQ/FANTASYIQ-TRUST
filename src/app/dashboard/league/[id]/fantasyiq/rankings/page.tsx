export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

import { redirect, notFound } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import RankingsHub from './RankingsHub';
import type { RankingPlayer } from '@/lib/rankings/rankingsUtils';

const ALL_FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

export default async function RankingsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id: true, userId: true, platform: true,
            leagueId: true, leagueName: true, season: true,
            scoringType: true, rosterPositions: true, totalRosters: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    // Only include positions that the league actually uses — never show K/DEF
    // in skill-only leagues or IDP positions in non-IDP leagues.
    const rosterPos = new Set(league.rosterPositions as string[]);
    const hasKicker = rosterPos.has('K');
    const hasDef    = rosterPos.has('DEF');
    const FANTASY_POSITIONS = new Set(
        [...ALL_FANTASY_POSITIONS].filter(pos =>
            pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE' ||
            (pos === 'K'   && hasKicker) ||
            (pos === 'DEF' && hasDef)
        )
    );

    // ── Determine season/week ─────────────────────────────────────────────────

    let week   = 1;
    let season = league.season;

    if (league.platform === 'sleeper') {
        try {
            const nflState = await getNflState();
            season = nflState.season;
            week   = nflState.week > 0 ? nflState.week : 1;
        } catch { /* keep defaults */ }
    }

    // ── Fetch projections ─────────────────────────────────────────────────────

    const pprField: 'pointsPpr' | 'pointsHalfPpr' | 'pointsStd' =
        league.scoringType === 'ppr'      ? 'pointsPpr'     :
        league.scoringType === 'half_ppr' ? 'pointsHalfPpr' : 'pointsStd';

    const [projections, allPlayers] = await Promise.all([
        prisma.playerProjection.findMany({
            where:  { season, week },
            select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { position: { in: Array.from(FANTASY_POSITIONS) }, active: true },
            select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
        }),
    ]);

    const playerMap = new Map(allPlayers.map(p => [p.playerId, p]));

    const rankingPlayers: RankingPlayer[] = [];
    for (const proj of projections) {
        const info     = playerMap.get(proj.playerId);
        if (!info || !FANTASY_POSITIONS.has(info.position)) continue;
        const baseProj = Math.round((proj[pprField] ?? 0) * 100) / 100;
        if (baseProj <= 0) continue;
        rankingPlayers.push({
            playerId:     proj.playerId,
            name:         info.fullName,
            position:     info.position,
            team:         info.team ?? '',
            injuryStatus: info.injuryStatus ?? null,
            baseProj,
        });
    }

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

            {rankingPlayers.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-2">
                    <p className="text-gray-400 font-semibold">No projection data available</p>
                    <p className="text-gray-600 text-sm">
                        {league.platform === 'espn'
                            ? 'Rankings are available for Sleeper leagues.'
                            : `No projections found for Week ${week} of the ${season} season.`}
                    </p>
                </div>
            ) : (
                <RankingsHub players={rankingPlayers} season={season} week={week} />
            )}

        </div>
    );
}
