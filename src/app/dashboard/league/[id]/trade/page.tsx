export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import Link from 'next/link';
import { getTradeEvaluatorContent } from '@/lib/trade/getTradeEvaluatorContent';
import TradeEvaluator from '@/components/league/TradeEvaluator';
import TradePartnersPanel from '../TradePartnersPanel';
import { getUserSubscriptionTier } from '@/lib/user/getUserSubscriptionTier';
import { isLeagueCommissionerCovered } from '@/lib/access';
import BackToOverview from '../_components/BackToOverview';
import { trackFeature } from '@/app/actions/analytics';

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    void trackFeature('trade_evaluator', { leagueId: id });

    const [tier, commCovered] = await Promise.all([
        getUserSubscriptionTier(),
        isLeagueCommissionerCovered(id),
    ]);

    if (tier < 2 && !commCovered) {
        return (
            <div className="space-y-4">
                <BackToOverview leagueId={id} />
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
                    <p className="text-[#D4AF37] font-semibold text-lg">Unlock Trade Evaluator</p>
                    <p className="text-gray-400 text-sm max-w-sm mx-auto">Trade Evaluator requires an All-Pro plan or higher.</p>
                    <Link href="/pricing" className="inline-block bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-6 py-2.5 rounded-lg transition text-sm mt-2">
                        View Plans
                    </Link>
                </div>
            </div>
        );
    }

    const content = await getTradeEvaluatorContent(id);
    return (
        <div className="space-y-4">
            <BackToOverview leagueId={id} />
            <TradePartnersPanel
                sleeperLeagueId={content.sleeperLeagueId}
                mySleeperUserId={content.mySleeperUserId}
            />
            <TradeEvaluator content={content} />
        </div>
    );
}
