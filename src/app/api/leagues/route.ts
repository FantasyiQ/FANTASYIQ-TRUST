import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueLimit, tierToLimitKey } from '@/lib/league-limits';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function POST(request: NextRequest): Promise<Response> {

    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;
    const session = await auth();
    if (!session?.user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as { leagueName?: string; platform?: string };
    const leagueName = body.leagueName?.trim();
    if (!leagueName) {
        return Response.json({ error: 'leagueName is required' }, { status: 400 });
    }

    const [user, commissionerLeagueNames] = await Promise.all([
        prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                id: true,
                subscriptionTier: true,
                subscriptions: {
                    where:  { status: { in: ['active', 'trialing'] } },
                    select: { tier: true, type: true },
                    orderBy: { createdAt: 'desc' },
                },
                connectedLeagues: { select: { leagueName: true } },
            },
        }),
        // Will be used below once we have the userId
        Promise.resolve([] as { leagueName: string }[]),
    ]);
    if (!user) {
        return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Resolve effective tier: active player plan > active commissioner plan > stored tier
    const activeTier =
        user.subscriptions.find(s => s.type === 'player')?.tier ??
        user.subscriptions.find(s => s.type === 'commissioner')?.tier ??
        user.subscriptionTier;

    const limitKey = tierToLimitKey(activeTier);
    const limit = getLeagueLimit(limitKey);

    // Fetch league names covered by a commissioner plan for this user so they
    // don't consume player slots.
    const coveredLeagues = await prisma.league.findMany({
        where:  { userId: user.id, assignedPlanType: 'commissioner' },
        select: { leagueName: true },
    });
    const coveredNames = new Set(coveredLeagues.map(l => l.leagueName.toLowerCase().trim()));

    // Count only non-commissioner-covered connected leagues against the limit.
    const currentCount = user.connectedLeagues.filter(
        cl => !coveredNames.has(cl.leagueName.toLowerCase().trim())
    ).length;

    if (currentCount >= limit) {
        return Response.json(
            { error: 'League limit reached. Upgrade to add more.' },
            { status: 403 }
        );
    }

    const existing = await prisma.connectedLeague.findFirst({
        where: { userId: user.id, leagueName: { equals: leagueName, mode: 'insensitive' } },
        select: { id: true },
    });
    if (existing) {
        return Response.json({ error: 'This league is already connected.' }, { status: 409 });
    }

    const league = await prisma.connectedLeague.create({
        data: {
            userId: user.id,
            leagueName,
            platform: body.platform?.trim() || null,
        },
        select: { id: true, leagueName: true, platform: true, createdAt: true  },
    });

    return Response.json(league, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<Response> {

    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;
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
        select: { userId: true, createdAt: true },
    });
    if (!league) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }
    if (league.userId !== user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lockedUntil = new Date(league.createdAt);
    lockedUntil.setFullYear(lockedUntil.getFullYear() + 1);
    if (new Date() < lockedUntil) {
        return Response.json(
            { error: 'This league slot is locked for the season. Connected leagues cannot be swapped mid-year to prevent abuse.' },
            { status: 403 }
        );
    }

    await prisma.connectedLeague.delete({ where: { id: leagueId } });
    return Response.json({ success: true });
}
