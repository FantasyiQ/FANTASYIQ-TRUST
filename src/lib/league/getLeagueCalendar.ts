import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export type CalendarEvent = {
    id:          string;
    type:        string;
    title:       string;
    description: string | null;
    date:        Date;
};

export type LeagueCalendarData = {
    league:   { id: string; leagueName: string; season: string };
    timeline: CalendarEvent[];
    keyDates: CalendarEvent[]; // upcoming events only, chronological
};

export async function getLeagueCalendar(id: string): Promise<LeagueCalendarData> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findFirst({
        where:  { id, userId: session.user.id },
        select: {
            id: true, leagueName: true, season: true,
            calendarEvents: { orderBy: { date: 'asc' } },
        },
    });
    if (!league) notFound();

    const today    = new Date(new Date().toDateString());
    const timeline = league.calendarEvents;
    const keyDates = timeline.filter(e => e.date >= today);

    return {
        league:   { id: league.id, leagueName: league.leagueName, season: league.season },
        timeline,
        keyDates,
    };
}
