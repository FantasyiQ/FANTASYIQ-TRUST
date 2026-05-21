import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

async function assertCommissioner(leagueId: string, userId: string) {
    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: { userId: true },
    });
    return league?.userId === userId;
}

export async function PATCH(
    _req: NextRequest,
    { params }: { params: Promise<{ leagueId: string; announcementId: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(_req));
    if (rl.limited) return rl.response!;


    const { leagueId, announcementId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isCommissioner = await assertCommissioner(leagueId, session.user.id);
    if (!isCommissioner) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const existing = await prisma.announcement.findUnique({
        where:  { id: announcementId },
        select: { pinned: true, leagueId: true },
    });
    if (!existing || existing.leagueId !== leagueId) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.announcement.update({
        where:   { id: announcementId },
        data:    { pinned: !existing.pinned },
        include: { author: { select: { name: true, image: true } } },
    });
    return Response.json(updated);
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ leagueId: string; announcementId: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(_req));
    if (rl.limited) return rl.response!;


    const { leagueId, announcementId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isCommissioner = await assertCommissioner(leagueId, session.user.id);
    if (!isCommissioner) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const existing = await prisma.announcement.findUnique({
        where:  { id: announcementId },
        select: { leagueId: true },
    });
    if (!existing || existing.leagueId !== leagueId) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.announcement.delete({ where: { id: announcementId } });
    return Response.json({ success: true });
}
