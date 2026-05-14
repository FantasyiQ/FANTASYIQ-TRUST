import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH /api/notifications/[id]
// Marks a single notification as read.
export async function PATCH(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const notification = await prisma.notification.findUnique({
        where:  { id },
        select: { userId: true },
    });
    if (!notification) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (notification.userId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    await prisma.notification.update({
        where: { id },
        data:  { read: true, readAt: new Date() },
    });

    return Response.json({ ok: true });
}

// DELETE /api/notifications/[id]
// Dismisses/deletes a single notification.
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const notification = await prisma.notification.findUnique({
        where:  { id },
        select: { userId: true },
    });
    if (!notification) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (notification.userId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    await prisma.notification.delete({ where: { id } });

    return Response.json({ ok: true });
}
