import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as {
        subscriptionId?: string;
        leagueName?: string;
        season?: string;
        buyInAmount?: number;
        teamCount?: number;
    };

    const { subscriptionId, leagueName, season, buyInAmount, teamCount } = body;

    if (!subscriptionId || !leagueName || !season || !buyInAmount || !teamCount) {
        return Response.json({ error: 'All fields are required.' }, { status: 400 });
    }
    if (buyInAmount <= 0 || teamCount < 2) {
        return Response.json({ error: 'Invalid buy-in or team count.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    // Verify the subscription belongs to this user and is a commissioner plan
    const sub = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        select: { id: true, userId: true, type: true, status: true, leagueDues: { select: { id: true } } },
    });

    if (!sub) return Response.json({ error: 'Subscription not found.' }, { status: 404 });
    if (sub.userId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });
    if (sub.type !== 'commissioner') return Response.json({ error: 'Only commissioner plans can use the dues tracker.' }, { status: 400 });
    if (sub.status !== 'active' && sub.status !== 'trialing') return Response.json({ error: 'Subscription is not active.' }, { status: 400 });
    if (sub.leagueDues) return Response.json({ error: 'A tracker already exists for this league.' }, { status: 400 });

    const dues = await prisma.leagueDues.create({
        data: {
            subscriptionId,
            commissionerId: user.id,
            leagueName,
            season,
            buyInAmount,
            teamCount,
            potTotal: 0,
            status: 'setup',
        },
    });

    return Response.json({ id: dues.id });
}
