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
                select: { id: true, tier: true },
                take:   5,
            },
        },
    });

    // subscriptions query is already filtered to active|trialing — past_due won't appear.
    // subscriptionTier on the User record persists through past_due (only cleared on cancel),
    // so we must verify it's backed by an active/trialing subscription before trusting it.
    const hasTier = user && (
        user.subscriptions.some(s => PAID_TIERS.has(s.tier)) ||
        (PAID_TIERS.has(user.subscriptionTier) && user.subscriptions.length > 0)
    );

    if (!hasTier) {
        return Response.json(
            { error: 'This feature requires a FiQ paid plan. Upgrade at /dashboard/upgrade.' },
            { status: 403 },
        );
    }

    return null;
}

/**
 * Verify the user has paid access to a specific league.
 *
 * Rules:
 * - If the league is commissioner-covered (assignedPlanType === 'commissioner'):
 *   any registered user gets access — the commissioner's plan covers all members.
 * - Commissioner plan owners: full access to all features on any league.
 * - Player Elite: unlimited leagues — all pass.
 * - Player Pro / All-Pro: only leagues where league.assignedPlanId === playerSub.id.
 *
 * Pass `assignedPlanId` and `assignedPlanType` from the League record fetched by the caller.
 */
export async function requireLeaguePaidAccess(
    userId: string,
    leagueAssignedPlanId: string | null,
    leagueAssignedPlanType?: string | null,
): Promise<Response | null> {
    // League is commissioner-covered — all members get access regardless of their own plan
    if (leagueAssignedPlanType === 'commissioner') return null;

    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: {
            subscriptions: {
                where:  { status: { in: ['active', 'trialing'] } },
                select: { id: true, type: true, tier: true },
            },
        },
    });

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const subs = user.subscriptions;

    // Commissioner plan owners always have full access
    if (subs.some(s => s.type === 'commissioner')) return null;

    const playerSub = subs.find(s => s.type === 'player');
    if (!playerSub) {
        return Response.json(
            { error: 'This feature requires a FiQ paid plan. Upgrade at /dashboard/upgrade.' },
            { status: 403 },
        );
    }

    // Elite: unlimited — no assignment required
    if (playerSub.tier === 'PLAYER_ELITE') return null;

    // Pro / All-Pro: league must be assigned to this subscription
    if (leagueAssignedPlanId === playerSub.id) return null;

    return Response.json(
        { error: 'This league is not assigned to your plan. Go to your Player Plan page to assign it.' },
        { status: 403 },
    );
}
