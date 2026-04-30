export const dynamic = 'force-dynamic';

import { getLeagueDues } from '@/lib/league/getLeagueDues';
import LeagueDuesView from '@/components/league/LeagueDuesView';

export default async function DuesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await getLeagueDues(id);
    return <LeagueDuesView {...data} />;
}
