// GET /api/prs/[userId]
// Returns the stored PRS score for a user, computing it on first access if absent.
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateAndSavePrs, getPrsTier } from '@/lib/prs';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ userId: string }> }
): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await params;

    // Users can only read their own PRS unless they are admins.
    if (session.user.id !== userId) {
        const caller = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { isAdmin: true },
        });
        if (!caller?.isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
    }

    // Check user exists.
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, prsRecord: true },
    });
    if (!user) {
        return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // If no score computed yet, calculate now.
    const record = user.prsRecord ?? (await calculateAndSavePrs(userId));

    return Response.json({
        user_id:            userId,
        season_score:       record.seasonScore,
        retention_score:    record.retentionScore,
        engagement_score:   record.engagementScore,
        commissioner_trust: record.commissionerTrust,
        behavior_score:     record.behaviorScore,
        prs:                record.prs,
        tier:               getPrsTier(record.prs),
    });
}
