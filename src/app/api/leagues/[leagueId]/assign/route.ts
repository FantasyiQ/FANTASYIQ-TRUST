import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH /api/leagues/[leagueId]/assign
// Body: { planId: string; planType: 'player' | 'commissioner' }
//       or { planId: null; planType: null } to unassign
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const { leagueId } = await params;
    const body = await request.json() as { planId: string | null; planType: 'player' | 'commissioner' | null };
    const { planId, planType } = body;

    // Validate the league belongs to this user
    const league = await prisma.league.findFirst({
        where: { id: leagueId, userId },
        select: { id: true },
    });
    if (!league) return Response.json({ error: 'League not found' }, { status: 404 });

    // If assigning to a plan, verify ownership
    if (planId) {
        const sub = await prisma.subscription.findFirst({
            where: { id: planId, userId },
            select: { id: true, type: true },
        });
        if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });
        if (planType && sub.type !== planType) {
            return Response.json({ error: 'Plan type mismatch' }, { status: 400 });
        }
    }

    await prisma.league.update({
        where: { id: leagueId },
        data: {
            assignedPlanId:   planId   ?? null,
            assignedPlanType: planType ?? null,
        },
    });

    return Response.json({ assigned: true });
}
