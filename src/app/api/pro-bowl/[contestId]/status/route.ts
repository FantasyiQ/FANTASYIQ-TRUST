import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH — update contest settings (activate/deactivate, reschedule, mark scoring final)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ contestId: string }> },
): Promise<Response> {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const contest = await prisma.proBowlContest.findUnique({
        where:  { id: contestId },
        select: { id: true, leagueId: true },
    });
    if (!contest) return Response.json({ error: 'Contest not found.' }, { status: 404 });

    // Verify commissioner (league owner)
    const league = await prisma.league.findFirst({
        where: { id: contest.leagueId, userId: user.id },
        select: { id: true },
    });
    if (!league) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as {
        isActive?:     boolean;
        openAt?:       string;
        lockAt?:       string;
        endAt?:        string;
        markFinal?:    boolean;
    };

    // Mark all entries final (scoring complete)
    if (body.markFinal) {
        await prisma.proBowlEntry.updateMany({
            where: { contestId },
            data:  { isFinal: true },
        });
        return Response.json({ success: true });
    }

    const updateData: Record<string, unknown> = {};
    if (body.isActive  !== undefined) updateData.isActive = body.isActive;
    if (body.openAt)                  updateData.openAt   = new Date(body.openAt);
    if (body.lockAt)                  updateData.lockAt   = new Date(body.lockAt);
    if (body.endAt)                   updateData.endAt    = new Date(body.endAt);

    if (Object.keys(updateData).length === 0) {
        return Response.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    await prisma.proBowlContest.update({ where: { id: contestId }, data: updateData });
    return Response.json({ success: true });
}
