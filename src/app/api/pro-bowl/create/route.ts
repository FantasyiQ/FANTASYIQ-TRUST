import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const body = await request.json() as { leagueDuesId?: string; season?: string };
    const { leagueDuesId, season } = body;
    if (!leagueDuesId || !season) return Response.json({ error: 'leagueDuesId and season are required.' }, { status: 400 });

    // Verify the dues tracker belongs to this commissioner
    const dues = await prisma.leagueDues.findUnique({
        where: { id: leagueDuesId },
        select: { id: true, commissionerId: true, proBowl: { select: { id: true } } },
    });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });
    if (dues.proBowl) return Response.json({ error: 'A contest already exists for this league.' }, { status: 409 });

    const contest = await prisma.proBowlContest.create({
        data: { leagueDuesId, season, week: 18, status: 'setup' },
        select: { id: true },
    });

    return Response.json({ id: contest.id });
}
