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

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const docs = await prisma.leagueDocument.findMany({
        where:   { leagueId },
        select:  { id: true, label: true, url: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });
    return Response.json({ documents: docs });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(req));
    if (rl.limited) return rl.response!;

    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!await assertCommissioner(leagueId, session.user.id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json() as { label?: string; url?: string };
    const label = body.label?.trim();
    const url   = body.url?.trim();

    if (!label) return Response.json({ error: 'Label is required.' }, { status: 400 });
    if (!url)   return Response.json({ error: 'URL is required.' }, { status: 400 });

    try { new URL(url); } catch { return Response.json({ error: 'Invalid URL.' }, { status: 400 }); }

    const doc = await prisma.leagueDocument.create({
        data:   { leagueId, label, url },
        select: { id: true, label: true, url: true, createdAt: true },
    });
    return Response.json({ document: doc }, { status: 201 });
}
