import { type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// One-time fix: for each user+leagueName with multiple commissioner subs,
// keep the one matching keepStripeSubId and delete the rest.
// Also re-points any League rows to the kept subscription.
//
// POST body: { keepStripeSubId: string }
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const caller = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { isAdmin: true },
    });
    if (!caller?.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json() as { keepStripeSubId?: string };
    const { keepStripeSubId } = body;
    if (!keepStripeSubId) return Response.json({ error: 'keepStripeSubId required' }, { status: 400 });

    // Find the subscription to keep
    const keeper = await prisma.subscription.findUnique({
        where:  { stripeSubscriptionId: keepStripeSubId },
        select: { id: true, userId: true, leagueName: true, type: true },
    });
    if (!keeper) return Response.json({ error: 'Subscription not found' }, { status: 404 });
    if (keeper.type !== 'commissioner') return Response.json({ error: 'Not a commissioner subscription' }, { status: 400 });
    if (!keeper.leagueName) return Response.json({ error: 'Subscription has no leagueName' }, { status: 400 });

    // Find all other commissioner subs for this user+leagueName
    const duplicates = await prisma.subscription.findMany({
        where: {
            userId:     keeper.userId,
            type:       'commissioner',
            leagueName: { equals: keeper.leagueName, mode: 'insensitive' },
            NOT: { id: keeper.id },
        },
        select: { id: true, stripeSubscriptionId: true },
    });

    if (duplicates.length === 0) {
        return Response.json({ message: 'No duplicates found', kept: keepStripeSubId });
    }

    const dupIds = duplicates.map(d => d.id);

    // Re-point any League rows assigned to a duplicate → assign to keeper
    const leaguesRepointed = await prisma.league.updateMany({
        where: { assignedPlanId: { in: dupIds } },
        data:  { assignedPlanId: keeper.id, assignedPlanType: 'commissioner' },
    });

    // Also ensure the keeper covers the league by name (in case it wasn't assigned)
    const leaguesAssigned = await prisma.league.updateMany({
        where: {
            userId:           keeper.userId,
            leagueName:       { equals: keeper.leagueName, mode: 'insensitive' },
            assignedPlanType: { not: 'commissioner' },
        },
        data: { assignedPlanId: keeper.id, assignedPlanType: 'commissioner' },
    });

    // Delete the duplicate subscriptions
    await prisma.subscription.deleteMany({ where: { id: { in: dupIds } } });

    return Response.json({
        kept:            keepStripeSubId,
        duplicatesRemoved: duplicates.length,
        duplicateSubIds:   dupIds,
        leaguesRepointed:  leaguesRepointed.count,
        leaguesAssigned:   leaguesAssigned.count,
    });
}
