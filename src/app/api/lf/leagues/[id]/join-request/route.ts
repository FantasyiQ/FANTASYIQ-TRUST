import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';

// POST — user submits a join request
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: leagueId } = await params;
    const userId = session.user.id;

    const league = await prisma.lFLeague.findUnique({
        where: { id: leagueId },
        select: {
            id:           true,
            name:         true,
            commissioner: { select: { ownerId: true } },
        },
    });
    if (!league) return Response.json({ error: 'League not found' }, { status: 404 });

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { introMessage } = body as Record<string, unknown>;

    try {
        const [req, requester] = await Promise.all([
            prisma.lFJoinRequest.create({
                data: {
                    leagueId,
                    userId,
                    introMessage: typeof introMessage === 'string' ? introMessage.trim() || null : null,
                },
            }),
            prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
        ]);

        // Notify the commissioner (fire-and-forget)
        const commOwner = league.commissioner?.ownerId;
        if (commOwner) {
            void notify({
                userId:  commOwner,
                type:    NotificationType.LF_JOIN_REQUEST,
                title:   'New join request',
                body:    `${requester?.name ?? 'Someone'} has requested to join ${league.name}.`,
                data:    { leagueId, memberName: requester?.name ?? undefined },
            });
        }

        return Response.json(req, { status: 201 });
    } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
            return Response.json({ error: 'You have already requested to join this league' }, { status: 409 });
        }
        throw err;
    }
}

// GET — get current user's request status for this league
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) return Response.json(null);

    const { id: leagueId } = await params;
    const req = await prisma.lFJoinRequest.findUnique({
        where: { leagueId_userId: { leagueId, userId: session.user.id } },
    });
    return Response.json(req);
}
