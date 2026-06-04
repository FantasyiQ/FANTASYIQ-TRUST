import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// GET — fetch commissioner with leagues + reviews
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const commissioner = await prisma.lFCommissioner.findUnique({
        where:   { id },
        include: {
            leagues: { orderBy: { createdAt: 'asc' } },
            reviews: {
                orderBy: [{ verified: 'desc' }, { seasonYear: 'desc' }],
                take: 10,
            },
        },
    });

    if (!commissioner) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(commissioner);
}

// PATCH — update commissioner profile (claimed owner only)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const commissioner = await prisma.lFCommissioner.findUnique({ where: { id } });
    if (!commissioner) return Response.json({ error: 'Not found' }, { status: 404 });
    if (commissioner.ownerId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { displayName, platformHandles } = body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof displayName === 'string' && displayName.trim()) {
        if (displayName.trim().length > 100) {
            return Response.json({ error: 'displayName must be 100 characters or fewer.' }, { status: 400 });
        }
        data.displayName = displayName.trim();
    }
    if (platformHandles !== undefined && typeof platformHandles === 'object' && platformHandles !== null) {
        data.platformHandles = platformHandles;
    }

    if (Object.keys(data).length === 0) {
        return Response.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const updated = await prisma.lFCommissioner.update({ where: { id }, data });
    return Response.json(updated);
}
