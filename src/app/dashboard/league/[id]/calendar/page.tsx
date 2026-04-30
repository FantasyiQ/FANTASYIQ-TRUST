export const dynamic = 'force-dynamic';

import { getLeagueCalendar } from '@/lib/league/getLeagueCalendar';
import LeagueCalendar from '@/components/league/LeagueCalendar';
import BackToOverview from '../_components/BackToOverview';

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await getLeagueCalendar(id);
    return (
        <div className="space-y-4">
            <BackToOverview leagueId={id} />
            <LeagueCalendar {...data} />
        </div>
    );
}
