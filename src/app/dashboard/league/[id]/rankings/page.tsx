export const dynamic = 'force-dynamic';
// force rebuild

import Link from 'next/link';
import { getUserSubscriptionTier } from '@/lib/user/getUserSubscriptionTier';
import { getLeagueRankings } from '@/lib/league/getLeagueRankings';
import LeagueRankingsView from '@/components/league/LeagueRankingsView';

export default async function RankingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const tier = await getUserSubscriptionTier();
    if (tier < 2) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
                <p className="text-[#C8A951] font-semibold text-lg">Unlock Player Rankings</p>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">Player Rankings requires an All-Pro plan or higher.</p>
                <Link href="/pricing" className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-6 py-2.5 rounded-lg transition text-sm mt-2">
                    View Plans
                </Link>
            </div>
        );
    }

    const data = await getLeagueRankings(id);
    return <LeagueRankingsView {...data} />;
}
