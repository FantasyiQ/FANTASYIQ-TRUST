import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const body = await request.json() as { leagueName?: string; season?: string; leagueDuesId?: string };
    const { leagueName, season, leagueDuesId } = body;
    if (!leagueName || !season) return Response.json({ error: 'leagueName and season are required.' }, { status: 400 });

    // If a dues tracker ID is supplied, verify ownership
    if (leagueDuesId) {
        const dues = await prisma.leagueDues.findUnique({
            where: { id: leagueDuesId },
            select: { commissionerId: true },
        });
        if (!dues || dues.commissionerId !== user.id) {
            return Response.json({ error: 'Forbidden.' }, { status: 403 });
        }
    }

    // Check for existing contest
    const existing = await prisma.proBowlContest.findFirst({
        where: { commissionerId: user.id, leagueName, season },
        select: { id: true },
    });
    if (existing) return Response.json({ error: 'A contest already exists for this league and season.' }, { status: 409 });

    const contest = await prisma.proBowlContest.create({
        data: {
            commissionerId: user.id,
            leagueName,
            season,
            week: 18,
            status: 'setup',
            ...(leagueDuesId ? { leagueDuesId } : {}),
        },
        select: { id: true },
    });

    return Response.json({ id: contest.id });
}
