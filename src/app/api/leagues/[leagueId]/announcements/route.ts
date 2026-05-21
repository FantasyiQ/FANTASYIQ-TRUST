import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function normalizeMediaUrl(raw: string): string {
    try {
        const url = new URL(raw);
        if (url.hostname === 'giphy.com') {
            const match = url.pathname.match(/\/gifs\/(?:[^/]+-)?([a-zA-Z0-9]+)\/?$/);
            if (match) return `https://media.giphy.com/media/${match[1]}/giphy.gif`;
        }
    } catch { /* invalid URL — return as-is */ }
    return raw;
}

async function assertCommissioner(leagueId: string, userId: string) {
    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: { userId: true },
    });
    return league?.userId === userId;
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const announcements = await prisma.announcement.findMany({
        where:   { leagueId },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        include: { author: { select: { name: true, image: true } } },
    });
    return Response.json(announcements, {
        headers: { 'Cache-Control': 'private, max-age=30' },
    });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isCommissioner = await assertCommissioner(leagueId, session.user.id);
    if (!isCommissioner) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as { body?: string; mediaUrl?: string };
    const text = body.body?.trim();
    if (!text) return Response.json({ error: 'body is required' }, { status: 400 });

    const mediaUrl = body.mediaUrl?.trim()
        ? normalizeMediaUrl(body.mediaUrl.trim())
        : null;

    const announcement = await prisma.announcement.create({
        data:    { leagueId, authorId: session.user.id, body: text, mediaUrl },
        include: { author: { select: { name: true, image: true } } },
    });
    return Response.json(announcement, { status: 201 });
}
