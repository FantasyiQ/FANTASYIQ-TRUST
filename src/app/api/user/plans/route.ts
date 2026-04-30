import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/user/plans — returns the authenticated user's active subscriptions
export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const subs = await prisma.subscription.findMany({
        where: {
            userId: session.user.id,
            status: { in: ['active', 'trialing'] },
        },
        select: { id: true, type: true, tier: true, leagueName: true },
    });

    return Response.json(subs);
}
