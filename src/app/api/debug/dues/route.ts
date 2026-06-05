import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'not authed' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true },
    });
    if (!user) return Response.json({ error: 'no user' }, { status: 404 });

    const dues = await prisma.leagueDues.findMany({
        where: { commissionerId: user.id },
        select: { id: true, leagueName: true, season: true, status: true, commissionerId: true, subscriptionId: true },
        orderBy: { createdAt: 'desc' },
    });

    const subs = await prisma.subscription.findMany({
        where: { userId: user.id, type: 'commissioner' },
        select: { id: true, leagueName: true, status: true },
        orderBy: { createdAt: 'desc' },
    });

    // Also check if ANY dues exist with matching league names regardless of commissionerId
    const allDuesByName = dues.length === 0 ? await prisma.leagueDues.findMany({
        where: { leagueName: { in: subs.map(s => s.leagueName ?? '') } },
        select: { id: true, leagueName: true, season: true, commissionerId: true, subscriptionId: true },
    }) : [];

    return Response.json({ userId: user.id, email: user.email, dues, subs, allDuesByName });
}
