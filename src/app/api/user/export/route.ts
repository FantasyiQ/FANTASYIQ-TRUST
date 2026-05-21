import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/user/export — GDPR data portability export
// Returns all personal data held for the authenticated user as a JSON download.
export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const [user, subscriptions, leagues, notifications, duesMemberships] = await Promise.all([
        prisma.user.findUnique({
            where:  { id: userId },
            select: {
                id:               true,
                email:            true,
                name:             true,
                image:            true,
                subscriptionTier: true,
                sleeperUserId:    true,
                yahooUserId:      true,
                createdAt:        true,
                updatedAt:        true,
                // Omit sensitive fields: hashedPassword, espnS2, swid, stripeCustomerId, tokens
            },
        }),
        prisma.subscription.findMany({
            where:  { userId },
            select: {
                id:                   true,
                type:                 true,
                tier:                 true,
                status:               true,
                leagueName:           true,
                leagueSize:           true,
                currentPeriodStart:   true,
                currentPeriodEnd:     true,
                cancelAtPeriodEnd:    true,
                createdAt:            true,
            },
        }),
        prisma.league.findMany({
            where:  { userId },
            select: {
                id:          true,
                platform:    true,
                leagueId:    true,
                leagueName:  true,
                season:      true,
                status:      true,
                createdAt:   true,
                lastSyncedAt: true,
            },
        }),
        prisma.notification.findMany({
            where:  { userId },
            orderBy: { createdAt: 'desc' },
            take:   500,
            select: {
                id:        true,
                type:      true,
                title:     true,
                body:      true,
                read:      true,
                createdAt: true,
            },
        }),
        prisma.duesMember.findMany({
            where:  { userId },
            select: {
                id:          true,
                displayName: true,
                teamName:    true,
                duesStatus:  true,
                paidAt:      true,
                createdAt:   true,
            },
        }),
    ]);

    const export_ = {
        exportedAt:   new Date().toISOString(),
        user,
        subscriptions,
        leagues,
        duesMemberships,
        notifications,
    };

    return new Response(JSON.stringify(export_, null, 2), {
        headers: {
            'Content-Type':        'application/json',
            'Content-Disposition': `attachment; filename="fantasyiq-data-export-${userId}.json"`,
            'Cache-Control':       'no-store',
        },
    });
}
