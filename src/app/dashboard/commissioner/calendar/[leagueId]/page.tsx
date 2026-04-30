import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import CalendarManager from './CalendarManager';

export const dynamic = 'force-dynamic';

export default async function CommissionerLeagueCalendarPage({
    params,
}: {
    params: Promise<{ leagueId: string }>;
}) {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) redirect('/sign-in');

    const league = await prisma.league.findFirst({
        where: { id: leagueId, userId: user.id },
        select: {
            id:          true,
            leagueName:  true,
            season:      true,
            totalRosters: true,
            scoringType: true,
            calendarEvents: {
                orderBy: { date: 'asc' },
                select: {
                    id: true, title: true, date: true, endDate: true,
                    type: true, description: true, allDay: true,
                },
            },
        },
    });
    if (!league) notFound();

    const events = league.calendarEvents.map(e => ({
        ...e,
        date:    e.date.toISOString(),
        endDate: e.endDate?.toISOString() ?? null,
    }));

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <Link href="/dashboard/commissioner/calendar"
                            className="text-gray-500 hover:text-gray-300 text-sm transition">
                            ← Season Calendar
                        </Link>
                        <h1 className="text-2xl font-bold mt-3">Season Calendar</h1>
                        <p className="text-gray-400 text-sm mt-0.5">
                            {league.leagueName} · {league.season} Season
                        </p>
                    </div>
                    <Link
                        href={`/dashboard/league/${leagueId}/calendar`}
                        className="border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-4 py-2 rounded-lg text-sm transition">
                        Member View →
                    </Link>
                </div>

                <CalendarManager
                    leagueId={leagueId}
                    leagueName={league.leagueName}
                    initial={events}
                />

            </div>
        </main>
    );
}
