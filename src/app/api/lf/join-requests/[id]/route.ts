import { auth }      from '@/lib/auth';
import { prisma }    from '@/lib/prisma';
import { LFJoinStatus } from '@prisma/client';
import { calculateAndSavePrs } from '@/lib/prs';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';

// PATCH — commissioner updates a join request status
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const joinReq = await prisma.lFJoinRequest.findUnique({
        where:   { id },
        include: { league: { select: { name: true, id: true, commissioner: { select: { ownerId: true } } } } },
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

    if (status === 'ACCEPTED') {
        await Promise.all([
            calculateAndSavePrs(joinReq.userId),
            notify({
                userId: joinReq.userId,
                type:   NotificationType.LF_JOIN_ACCEPTED,
                title:  `Application Accepted — ${joinReq.league.name}`,
                body:   `Your application to join ${joinReq.league.name} was accepted! The commissioner will be in touch with next steps.`,
                data:   { leagueId: joinReq.leagueId, leagueName: joinReq.league.name },
            }),
        ]);
    } else if (status === 'REJECTED') {
        await notify({
            userId: joinReq.userId,
            type:   NotificationType.LF_JOIN_REJECTED,
            title:  `Application Update — ${joinReq.league.name}`,
            body:   `Your application to ${joinReq.league.name} wasn't a match this time. Keep building your FiQ reputation to open more doors.`,
            data:   { leagueId: joinReq.leagueId, leagueName: joinReq.league.name },
        });
    }

    return Response.json(updated);
}
