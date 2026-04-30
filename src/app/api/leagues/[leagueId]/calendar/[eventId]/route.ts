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

// PATCH — update event
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ leagueId: string; eventId: string }> },
): Promise<Response> {
    const { leagueId, eventId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveOwner(leagueId, session.user.email);
    if (!userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const existing = await prisma.leagueCalendarEvent.findFirst({
        where: { id: eventId, leagueDbId: leagueId },
    });
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as {
        title?: string;
        date?: string;
        endDate?: string | null;
        type?: string;
        description?: string | null;
        allDay?: boolean;
    };

    const event = await prisma.leagueCalendarEvent.update({
        where: { id: eventId },
        data: {
            title:       body.title?.trim()        ?? existing.title,
            date:        body.date ? new Date(body.date) : existing.date,
            endDate:     body.endDate !== undefined
                             ? (body.endDate ? new Date(body.endDate) : null)
                             : existing.endDate,
            type:        VALID_TYPES.has(body.type ?? '') ? body.type! : existing.type,
            description: body.description !== undefined
                             ? (body.description?.trim() || null)
                             : existing.description,
            allDay:      body.allDay ?? existing.allDay,
        },
    });
    return Response.json(event);
}

// DELETE — remove event
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ leagueId: string; eventId: string }> },
): Promise<Response> {
    const { leagueId, eventId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveOwner(leagueId, session.user.email);
    if (!userId) return Response.json({ error: 'Forbidden' }, { status: 403 });

    await prisma.leagueCalendarEvent.deleteMany({
        where: { id: eventId, leagueDbId: leagueId },
    });
    return new Response(null, { status: 204 });
}
