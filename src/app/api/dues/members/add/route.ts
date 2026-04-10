import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { duesId?: string; displayName?: string; teamName?: string; email?: string };
    const { duesId, displayName, teamName, email } = body;

    if (!duesId || !displayName) return Response.json({ error: 'duesId and displayName are required.' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true, teamCount: true, _count: { select: { members: true } } },
    });
    if (!dues) return Response.json({ error: 'Tracker not found.' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });
    if (dues._count.members >= dues.teamCount) return Response.json({ error: 'Roster is full.' }, { status: 400 });

    // Link to FantasyIQ account if email matches
    const linkedUser = email ? await prisma.user.findUnique({ where: { email }, select: { id: true } }) : null;

    const member = await prisma.duesMember.create({
        data: {
            leagueDuesId: duesId,
            displayName,
            teamName: teamName || null,
            email: email || null,
            userId: linkedUser?.id ?? null,
        },
    });

    return Response.json({ id: member.id });
}
