// Server-side access control helpers.
// Always queries the DB for current subscription tier — never trusts the JWT,
// which may be stale if a subscription lapses between sign-ins.

import { prisma } from '@/lib/prisma';

// Tiers that unlock paid analytics features (Trade Partners, Roster Values,
// Draft Report, Start/Sit, Matchup Projections, Draft Assistant).
const PAID_TIERS = new Set([
    'PLAYER_PRO',
    'PLAYER_ALL_PRO',
    'PLAYER_ELITE',
    'COMMISSIONER_PRO',
    'COMMISSIONER_ALL_PRO',
    'COMMISSIONER_ELITE',
]);

/**
 * Verify the user has a paid tier. Returns null on success, or a 403 Response
 * that the route handler should return immediately.
 *
 * Usage:
 *   const deny = await requirePaidTier(userId);
 *   if (deny) return deny;
 */
export async function requirePaidTier(userId: string): Promise<Response | null> {
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: {
            subscriptionTier: true,
            subscriptions: {
                where:  { status: { in: ['active', 'trialing'] } },
                select: { id: true },
                take:   1,
            },
        },
    });

    const hasTier     = user && PAID_TIERS.has(user.subscriptionTier);
    const hasActiveSub = user && user.subscriptions.length > 0;

    if (!hasTier || !hasActiveSub) {
        return Response.json(
            { error: 'This feature requires a FiQ paid plan. Upgrade at /dashboard/upgrade.' },
            { status: 403 },
        );
    }

    return null;
}
