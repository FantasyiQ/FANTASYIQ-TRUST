export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getUserSubscriptionTier } from '@/lib/user/getUserSubscriptionTier';
import { isLeagueCommissionerCovered } from '@/lib/access';
import { getLeagueRankings } from '@/lib/league/getLeagueRankings';
import LeagueRankingsView from '@/components/league/LeagueRankingsView';
import BackToOverview from '../_components/BackToOverview';
import { trackFeature } from '@/app/actions/analytics';
import { prisma } from '@/lib/prisma';
import { calculatePreciseAge } from '@/lib/calculateAge';
import { computeRealRedraftBoard } from '@/lib/rankings/realRedraftBoard';
import { STANDARD_SCORING } from '@/lib/rankings/leagueScoringPoints';
import RedraftRankingsView from './RedraftRankingsView';

export default async function RankingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    void trackFeature('player_rankings', { leagueId: id });

    const [tier, commCovered, league] = await Promise.all([
        getUserSubscriptionTier(),
        isLeagueCommissionerCovered(id),
        prisma.league.findUnique({
            where:  { id },
            select: { leagueType: true, scoringType: true, leagueName: true, season: true, scoringSettings: true, rosterPositions: true },
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
        // Real per-league scoring settings when available (Sleeper always;
        // ESPN as of the translateEspnScoring capture) — falls back to a
        // generic PPR baseline only for platforms that don't expose granular
        // scoring yet (Yahoo/NFL), so the board is never simply blank.
        const scoringSettings = (league?.scoringSettings as Record<string, number> | null) ?? STANDARD_SCORING;
        const superflex = ((league?.rosterPositions as string[] | null) ?? []).includes('SUPER_FLEX');
        const players = await computeRealRedraftBoard(scoringSettings, superflex);

        return (
            <RedraftRankingsView
                players={players.map(p => ({
                    playerId:       p.playerId,
                    name:           p.name,
                    position:       p.position,
                    team:           p.team,
                    age:            p.age,
                    preciseAge:     calculatePreciseAge(p.birthDate),
                    adp:            p.adp,
                    realPtsPerGame: p.realPtsPerGame,
                    hasRealData:    p.hasRealData,
                    injuryStatus:   p.injuryStatus,
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
