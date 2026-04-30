export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getLeagueData } from '@/lib/league/getLeagueData';
import CommissionerHub from '@/components/league/CommissionerHub';

export default async function CommissionerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await getLeagueData(id);

    if (!data.league.is_owner) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                <p className="text-gray-400 font-medium">Commissioner tools are only available to the league commissioner.</p>
            </div>
        );
    }

    return <CommissionerHub {...data} />;
}
