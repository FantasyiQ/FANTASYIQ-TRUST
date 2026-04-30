export const dynamic = 'force-dynamic';

import { getLeagueDues } from '@/lib/league/getLeagueDues';
import LeagueDuesView from '@/components/league/LeagueDuesView';
import BackToOverview from '../_components/BackToOverview';

export default async function DuesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await getLeagueDues(id);
    return (
        <div className="space-y-4">
            <BackToOverview leagueId={id} />
            <LeagueDuesView {...data} />
        </div>
    );
}
