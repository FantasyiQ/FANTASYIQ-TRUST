// GET /api/user/slot-info
// Returns the current user's player plan slot usage and the set of league names
// covered by any active commissioner subscription in the system.
// Used by the sync page to show slot awareness before syncing.

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueLimit, tierToLimitKey } from '@/lib/league-limits';

export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const [user, commSubs] = await Promise.all([
        prisma.user.findUnique({
            where:  { id: userId },
            select: {
                subscriptionTier: true,
                leagues: {
                    where:  { assignedPlanType: 'player' },
                    select: { id: true },
                },
            },
        }),
        prisma.subscription.findMany({
            where: {
                type:       'commissioner',
                status:     { in: ['active', 'trialing'] },
                leagueName: { not: null },
            },
            select: { leagueName: true },
        }),
    ]);

    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const limitKey  = tierToLimitKey(user.subscriptionTier);
    const limit     = getLeagueLimit(limitKey);

    return Response.json({
        // null = unlimited (ELITE tier)
        slotLimit:               limit === Infinity ? null : limit,
        playerSlotsUsed:         user.leagues.length,
        // Lowercase-normalized league names covered by any active commissioner plan.
        // Used by the sync UI to badge leagues the user is likely invited to —
        // actual slot exemption is enforced server-side during sync.
        commissionerLeagueNames: commSubs.map(s => s.leagueName!.toLowerCase().trim()),
    });
}
