export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getUserSubscriptionTier } from '@/lib/user/getUserSubscriptionTier';
import { isLeagueCommissionerCovered } from '@/lib/access';
import { getLeagueRankings } from '@/lib/league/getLeagueRankings';
import LeagueRankingsView from '@/components/league/LeagueRankingsView';
import BackToOverview from '../_components/BackToOverview';
import { trackFeature } from '@/app/actions/analytics';
import { prisma } from '@/lib/prisma';
import { calculateAge, calculatePreciseAge } from '@/lib/calculateAge';
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
        const rawPlayers = await prisma.sleeperPlayer.findMany({
            where: {
                searchRank: { not: null },
                position:   { in: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] },
                // Not currently rostered on any NFL team — can't score fantasy
                // points this season regardless of a leftover searchRank from
                // whenever they were last relevant (catches long-inactive/
                // released players that the age check alone would miss).
                team:       { not: 'FA' },
            },
            orderBy: { searchRank: 'asc' },
            select: {
                playerId:     true,
                fullName:     true,
                position:     true,
                team:         true,
                age:          true,
                birthDate:    true,
                searchRank:   true,
                injuryStatus: true,
            },
            // Fetch a buffer beyond 300 since a few retired players get
            // filtered out below (age check) but still occupy slots here.
            take: 330,
        });

        // Sleeper's own `active` flag and stale searchRank are unreliable for
        // long-retired players (e.g. Drew Brees, Tom Brady both still show
        // active:true with a low leftover searchRank) — no real NFL player is
        // playing past their mid-40s, so a computed-age cutoff catches these
        // reliably where the source data doesn't. Team defenses (no birthDate)
        // are unaffected since calculateAge returns null for them.
        const MAX_PLAUSIBLE_AGE = 45;
        const players = rawPlayers
            .filter(p => {
                const computedAge = calculateAge(p.birthDate);
                return computedAge === null || computedAge <= MAX_PLAUSIBLE_AGE;
            })
            .slice(0, 300);

        return (
            <RedraftRankingsView
                players={players.map(p => ({
                    playerId:     p.playerId,
                    name:         p.fullName ?? '',
                    position:     p.position ?? '',
                    team:         p.team,
                    age:          p.age,
                    preciseAge:   calculatePreciseAge(p.birthDate),
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
