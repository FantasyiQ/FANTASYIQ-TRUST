import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// POST — commissioner adds a season record
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: leagueId } = await params;

    const league = await prisma.lFLeague.findUnique({
        where:   { id: leagueId },
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

    const { year, champion, payoutSent, payoutDate, notes } = body as Record<string, unknown>;
    if (typeof year !== 'number' || year < 2000 || year > 2100) {
        return Response.json({ error: 'year must be a valid year' }, { status: 400 });
    }

    try {
        const season = await prisma.lFLeagueSeason.create({
            data: {
                leagueId,
                year,
                champion:   typeof champion  === 'string' ? champion.trim()  || null : null,
                payoutSent: typeof payoutSent === 'boolean' ? payoutSent : false,
                payoutDate: typeof payoutDate === 'string' && payoutDate ? new Date(payoutDate) : null,
                notes:      typeof notes     === 'string' ? notes.trim()     || null : null,
            },
        });
        return Response.json(season, { status: 201 });
    } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
            return Response.json({ error: 'Season already exists for that year' }, { status: 409 });
        }
        throw err;
    }
}
