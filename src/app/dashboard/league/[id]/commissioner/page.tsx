export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getLeagueData } from '@/lib/league/getLeagueData';
import CommissionerHub from '@/components/league/CommissionerHub';
import BackToOverview from '../_components/BackToOverview';

export default async function CommissionerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await getLeagueData(id);

    if (!data.league.is_owner) {
        redirect(`/dashboard/league/${id}/overview`);
    }

    return (
        <div className="space-y-4">
            <BackToOverview leagueId={id} />
            <CommissionerHub {...data} />
        </div>
    );
}
