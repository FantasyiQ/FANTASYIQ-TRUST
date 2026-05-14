import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const PAGE_SIZE = 20;

// GET /api/notifications?offset=0&limit=20
// Bell uses limit=8&offset=0 (fast). Full page uses paginated cursor.
export async function GET(req: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const url    = new URL(req.url);
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
    const limit  = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(PAGE_SIZE), 10)));

    const where = {
        userId: user.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    const [notifications, unreadCount, total] = await Promise.all([
        prisma.notification.findMany({
            where,
            orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
            skip:   offset,
            take:   limit,
            select: {
                id:        true,
                type:      true,
                title:     true,
                body:      true,
                data:      true,
                read:      true,
                readAt:    true,
                createdAt: true,
            },
        }),
        prisma.notification.count({ where: { ...where, read: false } }),
        prisma.notification.count({ where }),
    ]);

    return Response.json({ notifications, unreadCount, total, offset, limit });
}

// PATCH /api/notifications
// Body: { action: 'read-all' } — marks all notifications as read.
export async function PATCH(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const body = await request.json() as { action?: string };
    if (body.action !== 'read-all') {
        return Response.json({ error: 'Invalid action.' }, { status: 400 });
    }

    await prisma.notification.updateMany({
        where: { userId: user.id, read: false },
        data:  { read: true, readAt: new Date() },
    });

    return Response.json({ ok: true });
}
