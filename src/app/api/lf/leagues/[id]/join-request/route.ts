import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

    const league = await prisma.lFLeague.findUnique({ where: { id: leagueId } });
    if (!league) return Response.json({ error: 'League not found' }, { status: 404 });

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { introMessage } = body as Record<string, unknown>;

    try {
        const req = await prisma.lFJoinRequest.create({
            data: {
                leagueId,
                userId,
                introMessage: typeof introMessage === 'string' ? introMessage.trim() || null : null,
            },
        });
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
