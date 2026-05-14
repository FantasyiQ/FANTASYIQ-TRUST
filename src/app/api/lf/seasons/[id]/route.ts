import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH — update a season record
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const season = await prisma.lFLeagueSeason.findUnique({
        where:   { id },
        include: { league: { include: { commissioner: { select: { ownerId: true } } } } },
    });
    if (!season) return Response.json({ error: 'Not found' }, { status: 404 });
    if (season.league.commissioner.ownerId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { champion, payoutSent, payoutDate, notes } = body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof champion   === 'string')  data.champion   = champion.trim() || null;
    if (typeof payoutSent === 'boolean') data.payoutSent = payoutSent;
    if (typeof payoutDate === 'string')  data.payoutDate = payoutDate ? new Date(payoutDate) : null;
    if (typeof notes      === 'string')  data.notes      = notes.trim() || null;

    const updated = await prisma.lFLeagueSeason.update({ where: { id }, data });
    return Response.json(updated);
}

// DELETE — remove a season record
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const season = await prisma.lFLeagueSeason.findUnique({
        where:   { id },
        include: { league: { include: { commissioner: { select: { ownerId: true } } } } },
    });
    if (!season) return Response.json({ error: 'Not found' }, { status: 404 });
    if (season.league.commissioner.ownerId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.lFLeagueSeason.delete({ where: { id } });
    return new Response(null, { status: 204 });
}
