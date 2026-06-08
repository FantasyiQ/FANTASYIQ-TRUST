import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const league = await prisma.lFLeague.findUnique({
        where:   { id },
        include: {
            commissioner: {
                select: {
                    id:             true,
                    displayName:    true,
                    platformHandles: true,
                    avgRating:      true,
                    reviewsCount:   true,
                    flagsCount:     true,
                    claimed:        true,
                },
            },
            reviews: {
                orderBy: { createdAt: 'desc' },
                include: {
                    reviewer: { select: { id: true, name: true, image: true } },
                },
            },
        },
    });

    if (!league) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }

    return Response.json(league);
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const league = await prisma.lFLeague.findUnique({
        where:   { id },
        include: { commissioner: { select: { ownerId: true } } },
    });
    if (!league) return Response.json({ error: 'Not found' }, { status: 404 });
    if (league.commissioner.ownerId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const {
        name, platform, format, scoring, size, buyIn,
        completedSeasons, activityLevel, requiresMinPrs,
    } = body as Record<string, unknown>;

    if (typeof name     !== 'string' || !name.trim())     return Response.json({ error: 'name is required' },     { status: 400 });
    if (typeof platform !== 'string' || !platform.trim()) return Response.json({ error: 'platform is required' }, { status: 400 });
    if (typeof format   !== 'string' || !format.trim())   return Response.json({ error: 'format is required' },   { status: 400 });
    if (typeof scoring  !== 'string' || !scoring.trim())  return Response.json({ error: 'scoring is required' },  { status: 400 });
    if (typeof size     !== 'number' || size < 2)         return Response.json({ error: 'size must be ≥ 2' },     { status: 400 });

    const seasons        = typeof completedSeasons === 'number' && completedSeasons >= 0 ? Math.floor(completedSeasons) : league.completedSeasons;
    const stabilityScore = Math.min(100, seasons * 20);
    const level          = typeof activityLevel === 'number' && activityLevel >= 1 && activityLevel <= 5 ? Math.floor(activityLevel) : Math.round(league.activityScore / 20);
    const activityScore  = level * 20;

    const minPrsRaw = typeof requiresMinPrs === 'number' ? Math.round(requiresMinPrs) : null;
    if (minPrsRaw !== null && (minPrsRaw < 0 || minPrsRaw > 100)) {
        return Response.json({ error: 'requiresMinPrs must be 0–100' }, { status: 400 });
    }

    const updated = await prisma.lFLeague.update({
        where: { id },
        data: {
            name:             name.trim(),
            platform:         platform.trim(),
            format:           format.trim(),
            scoring:          scoring.trim(),
            size,
            buyIn:            typeof buyIn === 'number' ? buyIn : null,
            completedSeasons: seasons,
            stabilityScore,
            activityScore,
            requiresMinPrs:   minPrsRaw,
        },
    });

    return Response.json(updated);
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const league = await prisma.lFLeague.findUnique({
        where:   { id },
        include: { commissioner: { select: { ownerId: true } } },
    });
    if (!league) return Response.json({ error: 'Not found' }, { status: 404 });
    if (league.commissioner.ownerId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.lFLeague.delete({ where: { id } });

    return Response.json({ ok: true });
}
