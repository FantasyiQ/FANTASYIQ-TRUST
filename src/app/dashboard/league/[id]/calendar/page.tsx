export const dynamic = 'force-dynamic';

import { getLeagueCalendar } from '@/lib/league/getLeagueCalendar';
import LeagueCalendar from '@/components/league/LeagueCalendar';

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await getLeagueCalendar(id);
    return <LeagueCalendar {...data} />;
}
