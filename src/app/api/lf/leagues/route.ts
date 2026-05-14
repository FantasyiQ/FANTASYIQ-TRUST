import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const {
        name, platform, format, scoring, size, buyIn,
        commissionerId, payoutStructure,
        completedSeasons, activityLevel,
    } = body as Record<string, unknown>;

    if (typeof name           !== 'string' || !name.trim())           return Response.json({ error: 'name is required' },           { status: 400 });
    if (typeof platform       !== 'string' || !platform.trim())       return Response.json({ error: 'platform is required' },       { status: 400 });
    if (typeof format         !== 'string' || !format.trim())         return Response.json({ error: 'format is required' },         { status: 400 });
    if (typeof scoring        !== 'string' || !scoring.trim())        return Response.json({ error: 'scoring is required' },        { status: 400 });
    if (typeof size           !== 'number' || size < 2)               return Response.json({ error: 'size must be ≥ 2' },           { status: 400 });
    if (typeof commissionerId !== 'string' || !commissionerId.trim()) return Response.json({ error: 'commissionerId is required' }, { status: 400 });

    const commissionerExists = await prisma.lFCommissioner.findUnique({ where: { id: commissionerId } });
    if (!commissionerExists) return Response.json({ error: 'Commissioner not found' }, { status: 404 });

    // stabilityScore = completedSeasons * 20, capped at 100
    const seasons        = typeof completedSeasons === 'number' && completedSeasons >= 0 ? Math.floor(completedSeasons) : 0;
    const stabilityScore = Math.min(100, seasons * 20);

    // activityScore = activityLevel (1–5) * 20; defaults to 0 (unrated)
    const level          = typeof activityLevel === 'number' && activityLevel >= 1 && activityLevel <= 5 ? Math.floor(activityLevel) : 0;
    const activityScore  = level * 20;

    const league = await prisma.lFLeague.create({
        data: {
            name:             name.trim(),
            platform:         platform.trim(),
            format:           format.trim(),
            scoring:          scoring.trim(),
            size,
            buyIn:            typeof buyIn === 'number' ? buyIn : null,
            payoutStructure:  payoutStructure !== undefined ? (payoutStructure as object) : undefined,
            commissionerId,
            completedSeasons: seasons,
            stabilityScore,
            activityScore,
        },
        include: { commissioner: true },
    });

    return Response.json(league, { status: 201 });
}
