import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function POST(request: Request) {

    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { displayName, platformHandles } = body as Record<string, unknown>;

    if (typeof displayName !== 'string' || !displayName.trim()) {
        return Response.json({ error: 'displayName is required' }, { status: 400 });
    }
    if (!platformHandles || typeof platformHandles !== 'object' || Array.isArray(platformHandles)) {
        return Response.json({ error: 'platformHandles must be an object' }, { status: 400 });
    }

    // One commissioner profile per user
    const existing = await prisma.lFCommissioner.findUnique({ where: { ownerId: session.user.id } });
    if (existing) {
        return Response.json({ error: 'You already own a commissioner profile' }, { status: 409 });
    }

    // Claim immediately at creation — eliminates the race window where a separate
    // /claim call could be intercepted by another user before the creator calls it.
    const commissioner = await prisma.lFCommissioner.create({
        data: {
            displayName:     displayName.trim(),
            platformHandles: platformHandles as Record<string, string>,
            ownerId:         session.user.id,
            claimed:         true,
        },
    });

    return Response.json(commissioner, { status: 201 });
}
