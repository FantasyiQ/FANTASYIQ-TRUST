export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getUserSubscriptionTier } from '@/lib/user/getUserSubscriptionTier';
import { isLeagueCommissionerCovered } from '@/lib/access';
import { getLeagueRankings } from '@/lib/league/getLeagueRankings';
import LeagueRankingsView from '@/components/league/LeagueRankingsView';
import BackToOverview from '../_components/BackToOverview';
import { trackFeature } from '@/app/actions/analytics';
import { prisma } from '@/lib/prisma';
import RedraftRankingsView from './RedraftRankingsView';

export default async function RankingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    void trackFeature('player_rankings', { leagueId: id });

    const [tier, commCovered, league] = await Promise.all([
        getUserSubscriptionTier(),
        isLeagueCommissionerCovered(id),
        prisma.league.findUnique({
            where:  { id },
            select: { leagueType: true, scoringType: true, leagueName: true, season: true },
        }),
    ]);

    if (tier < 2 && !commCovered) {
        return (
            <div className="space-y-4">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
                    <p className="text-[#D4AF37] font-semibold text-lg">Unlock Player Rankings</p>
                    <p className="text-gray-400 text-sm max-w-sm mx-auto">Player Rankings requires an All-Pro plan or higher.</p>
                    <Link href="/pricing" className="inline-block bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-6 py-2.5 rounded-lg transition text-sm mt-2">
                        View Plans
                    </Link>
                </div>
            </div>
        );
    }

    const isDynasty = league?.leagueType === 'Dynasty';

    if (!isDynasty) {
        const players = await prisma.sleeperPlayer.findMany({
            where: {
                searchRank: { not: null },
                position:   { in: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] },
            },
            orderBy: { searchRank: 'asc' },
            select: {
                playerId:     true,
                fullName:     true,
                position:     true,
                team:         true,
                age:          true,
                searchRank:   true,
                injuryStatus: true,
            },
            take: 300,
        });

        return (
            <RedraftRankingsView
                players={players.map(p => ({
                    playerId:     p.playerId,
                    name:         p.fullName ?? '',
                    position:     p.position ?? '',
                    team:         p.team,
                    age:          p.age,
                    adp:          p.searchRank ?? 999,
                    injuryStatus: p.injuryStatus,
                }))}
                leagueName={league?.leagueName ?? ''}
                season={league?.season ?? '2026'}
            />
        );
    }

    const data = await getLeagueRankings(id);
    return (
        <div className="space-y-4">
            <BackToOverview leagueId={id} />
            <LeagueRankingsView {...data} />
        </div>
    );
}
