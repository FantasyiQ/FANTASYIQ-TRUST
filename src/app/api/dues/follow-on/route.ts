import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST — create a follow-on season tracker from an existing one (no subscription required)
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json() as { sourceDuesId?: string; season?: string };
    const { sourceDuesId, season } = body;
    if (!sourceDuesId || !season) {
        return Response.json({ error: 'sourceDuesId and season are required' }, { status: 400 });
    }

    const source = await prisma.leagueDues.findUnique({
        where: { id: sourceDuesId },
        select: { commissionerId: true, leagueName: true, buyInAmount: true, teamCount: true },
    });
    if (!source) return Response.json({ error: 'Source tracker not found' }, { status: 404 });
    if (source.commissionerId !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Check if a tracker for this league+season already exists
    const existing = await prisma.leagueDues.findFirst({
        where: { commissionerId: user.id, leagueName: source.leagueName, season },
        select: { id: true },
    });
    if (existing) return Response.json({ id: existing.id, alreadyExists: true });

    const newTracker = await prisma.leagueDues.create({
        data: {
            commissionerId: user.id,
            leagueName: source.leagueName,
            season,
            buyInAmount: source.buyInAmount,
            teamCount: source.teamCount,
            potTotal: 0,
            status: 'setup',
        },
    });

    return Response.json({ id: newTracker.id }, { status: 201 });
}
