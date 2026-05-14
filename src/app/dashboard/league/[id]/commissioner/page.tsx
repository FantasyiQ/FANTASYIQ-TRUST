export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getLeagueData } from '@/lib/league/getLeagueData';
import CommissionerHub from '@/components/league/CommissionerHub';

export default async function CommissionerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await getLeagueData(id);

    if (!data.league.is_owner) {
        // Non-commissioners see a Pay Dues card
        return (
            <div className="space-y-4">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
                    <h2 className="font-semibold text-white">Pay Dues</h2>
                    <p className="text-gray-400 text-sm">
                        {data.dues
                            ? 'Your commissioner has set up dues for this league. Pay your buy-in to lock in your spot.'
                            : 'Your commissioner hasn\'t set up dues for this league yet.'}
                    </p>
                    {data.dues && (
                        <Link
                            href={`/dashboard/league/${id}/dues/pay`}
                            className="inline-block bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm"
                        >
                            Pay Dues →
                        </Link>
                    )}
                </div>
            </div>
        );
    }

    return <CommissionerHub {...data} />;
}
