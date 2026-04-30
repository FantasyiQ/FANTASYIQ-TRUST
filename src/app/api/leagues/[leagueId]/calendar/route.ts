import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VALID_TYPES = new Set([
    'draft', 'trade_deadline', 'waiver_deadline',
    'regular_season_end', 'playoff_start', 'championship', 'custom',
]);

async function resolveOwner(leagueId: string, email: string) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return null;
    const league = await prisma.league.findFirst({
        where: { id: leagueId, userId: user.id },
        select: { id: true },
    });
    return league ? user.id : null;
}

// GET — all events for the league (any authenticated user who owns the league record)
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveOwner(leagueId, session.user.email);
    if (!userId) return Response.json({ error: 'Not found' }, { status: 404 });

    const events = await prisma.leagueCalendarEvent.findMany({
        where: { leagueDbId: leagueId },
        orderBy: { date: 'asc' },
    });
    return Response.json(events);
}

// POST — create a new event (commissioner / league owner only)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveOwner(leagueId, session.user.email);
    if (!userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as {
        title?: string;
        date?: string;
        endDate?: string;
        type?: string;
        description?: string;
        allDay?: boolean;
    };

    const title = body.title?.trim();
    if (!title) return Response.json({ error: 'title is required' }, { status: 400 });
    if (!body.date) return Response.json({ error: 'date is required' }, { status: 400 });

    const date = new Date(body.date);
    if (isNaN(date.getTime())) return Response.json({ error: 'Invalid date' }, { status: 400 });

    const type = VALID_TYPES.has(body.type ?? '') ? (body.type ?? 'custom') : 'custom';

    const event = await prisma.leagueCalendarEvent.create({
        data: {
            leagueDbId:  leagueId,
            title,
            date,
            endDate:     body.endDate ? new Date(body.endDate) : null,
            type,
            description: body.description?.trim() || null,
            allDay:      body.allDay ?? true,
        },
    });
    return Response.json(event, { status: 201 });
}
