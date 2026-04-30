import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function deriveStatus(c: { openAt: Date; lockAt: Date; endAt: Date; isActive: boolean }): string {
    if (!c.isActive) return 'canceled';
    const now = new Date();
    if (now < c.openAt)  return 'upcoming';
    if (now < c.lockAt)  return 'open';
    if (now < c.endAt)   return 'locked';
    return 'complete';
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ contestId: string }> },
): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { contestId } = await params;

    const contest = await prisma.proBowlContest.findUnique({
        where:  { id: contestId },
        select: {
            id:       true,
            openAt:   true,
            lockAt:   true,
            endAt:    true,
            isActive: true,
            entries: {
                orderBy: [{ totalPoints: 'desc' }, { createdAt: 'asc' }],
                select: {
                    id:          true,
                    userId:      true,
                    totalPoints: true,
                    isFinal:     true,
                    user:        { select: { name: true } },
                },
            },
        },
    });

    if (!contest) return Response.json({ error: 'Not found' }, { status: 404 });

    return Response.json({
        status:  deriveStatus(contest),
        isFinal: contest.entries.every(e => e.isFinal),
        entries: contest.entries.map((e, i) => ({
            rank:        i + 1,
            userId:      e.userId,
            name:        e.user.name,
            totalPoints: e.totalPoints,
            isFinal:     e.isFinal,
        })),
    });
}
