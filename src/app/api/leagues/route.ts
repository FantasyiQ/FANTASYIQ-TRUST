import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueLimit, tierToLimitKey } from '@/lib/league-limits';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as { leagueName?: string; platform?: string };
    const leagueName = body.leagueName?.trim();
    if (!leagueName) {
        return Response.json({ error: 'leagueName is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            subscriptionTier: true,
            _count: { select: { connectedLeagues: true } },
        },
    });
    if (!user) {
        return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const limitKey = tierToLimitKey(user.subscriptionTier);
    const limit = getLeagueLimit(limitKey);
    const currentCount = user._count.connectedLeagues;

    if (currentCount >= limit) {
        return Response.json(
            { error: 'League limit reached. Upgrade to add more.' },
            { status: 403 }
        );
    }

    const league = await prisma.connectedLeague.create({
        data: {
            userId: user.id,
            leagueName,
            platform: body.platform?.trim() || null,
        },
        select: { id: true, leagueName: true, platform: true, createdAt: true },
    });

    return Response.json(league, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leagueId = request.nextUrl.searchParams.get('leagueId');
    if (!leagueId) {
        return Response.json({ error: 'leagueId query param is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) {
        return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const league = await prisma.connectedLeague.findUnique({
        where: { id: leagueId },
        select: { userId: true },
    });
    if (!league) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }
    if (league.userId !== user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.connectedLeague.delete({ where: { id: leagueId } });
    return Response.json({ success: true });
}
