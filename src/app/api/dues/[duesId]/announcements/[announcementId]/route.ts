import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function assertCommissioner(duesId: string, email: string) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return null;
    const dues = await prisma.leagueDues.findUnique({ where: { id: duesId }, select: { commissionerId: true } });
    if (!dues || dues.commissionerId !== user.id) return null;
    return user;
}

// PATCH — toggle pin
export async function PATCH(
    _req: NextRequest,
    { params }: { params: Promise<{ duesId: string; announcementId: string }> }
): Promise<Response> {
    const { duesId, announcementId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await assertCommissioner(duesId, session.user.email);
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const existing = await prisma.announcement.findUnique({
        where: { id: announcementId },
        select: { pinned: true, leagueDuesId: true },
    });
    if (!existing || existing.leagueDuesId !== duesId) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.announcement.update({
        where: { id: announcementId },
        data: { pinned: !existing.pinned },
        include: { author: { select: { name: true, image: true } } },
    });
    return Response.json(updated);
}

// DELETE — remove announcement
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ duesId: string; announcementId: string }> }
): Promise<Response> {
    const { duesId, announcementId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await assertCommissioner(duesId, session.user.email);
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const existing = await prisma.announcement.findUnique({
        where: { id: announcementId },
        select: { leagueDuesId: true },
    });
    if (!existing || existing.leagueDuesId !== duesId) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.announcement.delete({ where: { id: announcementId } });
    return Response.json({ success: true });
}
