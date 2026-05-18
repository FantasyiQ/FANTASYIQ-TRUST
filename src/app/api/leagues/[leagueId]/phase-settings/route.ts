import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH /api/leagues/[leagueId]/phase-settings
// Allows a commissioner to manually set playoffWeekStart and champWeek.
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;

    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: { id: true, userId: true },
    });

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json() as { playoffWeekStart?: number; champWeek?: number };

    const { playoffWeekStart, champWeek } = body;

    // Validate: both must be positive integers 1–18
    if (
        (playoffWeekStart !== undefined && (playoffWeekStart < 1 || playoffWeekStart > 18)) ||
        (champWeek        !== undefined && (champWeek < 1        || champWeek > 18))
    ) {
        return Response.json({ error: 'Week must be between 1 and 18' }, { status: 400 });
    }

    if (champWeek !== undefined && playoffWeekStart !== undefined && champWeek <= playoffWeekStart) {
        return Response.json({ error: 'Championship week must be after playoff start week' }, { status: 400 });
    }

    await prisma.league.update({
        where: { id: leagueId },
        data: {
            ...(playoffWeekStart !== undefined && { playoffWeekStart }),
            ...(champWeek        !== undefined && { champWeek }),
        },
    });

    return Response.json({ ok: true });
}
