import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Convert a Giphy share URL to a direct media URL if possible. */
function normalizeMediaUrl(raw: string): string {
    try {
        const url = new URL(raw);
        // https://giphy.com/gifs/something-GIFID  →  direct GIF
        if (url.hostname === 'giphy.com') {
            const match = url.pathname.match(/\/gifs\/(?:[^/]+-)?([a-zA-Z0-9]+)\/?$/);
            if (match) return `https://media.giphy.com/media/${match[1]}/giphy.gif`;
        }
        // https://media.giphy.com/… — already direct
        // https://tenor.com/… — leave as-is; users should paste direct media URL
    } catch { /* invalid URL — let the API validate it */ }
    return raw;
}

async function assertCommissioner(duesId: string, email: string) {
    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, image: true },
    });
    if (!user) return null;
    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true },
    });
    if (!dues || dues.commissionerId !== user.id) return null;
    return user;
}

// GET — fetch all announcements for this dues tracker
export async function GET(_req: NextRequest, { params }: { params: Promise<{ duesId: string }> }): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'Not found' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({ where: { id: duesId }, select: { commissionerId: true } });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const announcements = await prisma.announcement.findMany({
        where: { leagueDuesId: duesId },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        include: { author: { select: { name: true, image: true } } },
    });
    return Response.json(announcements);
}

// POST — create a new announcement
export async function POST(req: NextRequest, { params }: { params: Promise<{ duesId: string }> }): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await assertCommissioner(duesId, session.user.email);
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as { body?: string; mediaUrl?: string };
    const text = body.body?.trim();
    if (!text) return Response.json({ error: 'body is required' }, { status: 400 });

    const mediaUrl = body.mediaUrl?.trim()
        ? normalizeMediaUrl(body.mediaUrl.trim())
        : null;

    const announcement = await prisma.announcement.create({
        data: { leagueDuesId: duesId, authorId: user.id, body: text, mediaUrl },
        include: { author: { select: { name: true, image: true } } },
    });
    return Response.json(announcement, { status: 201 });
}
