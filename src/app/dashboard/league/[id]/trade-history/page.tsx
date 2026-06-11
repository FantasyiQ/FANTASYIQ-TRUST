export const dynamic = 'force-dynamic';

import BackToOverview from '../_components/BackToOverview';
import TradeHistoryPanel from '../TradeHistoryPanel';

export default async function TradeHistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return (
        <div className="space-y-5">
            <BackToOverview leagueId={id} />
            <div>
                <h1 className="text-2xl font-bold text-white">Trade History</h1>
                <p className="text-gray-500 text-sm mt-1">All completed trades in this league, most recent first.</p>
            </div>
            <TradeHistoryPanel leagueId={id} />
        </div>
    );
}
