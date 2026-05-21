import { auth }      from '@/lib/auth';
import { prisma }    from '@/lib/prisma';
import { LFJoinStatus } from '@prisma/client';
import { recalcPRS } from '@/lib/lf-prs';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// PATCH — commissioner updates a join request status
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const joinReq = await prisma.lFJoinRequest.findUnique({
        where:   { id },
        include: { league: { include: { commissioner: { select: { ownerId: true } } } } },
    });
    if (!joinReq) return Response.json({ error: 'Not found' }, { status: 404 });
    if (joinReq.league.commissioner.ownerId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { status } = body as Record<string, unknown>;
    const validStatuses: LFJoinStatus[] = ['PENDING', 'ACCEPTED', 'REJECTED', 'PINNED'];
    if (typeof status !== 'string' || !validStatuses.includes(status as LFJoinStatus)) {
        return Response.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updated = await prisma.lFJoinRequest.update({
        where: { id },
        data:  { status: status as LFJoinStatus },
    });

    // Accepted requests count toward the player's PRS
    if (status === 'ACCEPTED') {
        await recalcPRS(joinReq.userId);
    }

    return Response.json(updated);
}
