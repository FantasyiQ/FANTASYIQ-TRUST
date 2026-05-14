import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET — commissioner views waitlist for their league
export async function GET(
    _request: Request,
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

    const requests = await prisma.lFJoinRequest.findMany({
        where:   { leagueId },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        include: {
            user: {
                select: {
                    id: true, name: true, trustScore: true,
                    lfReviews: {
                        where:  { verified: true },
                        select: { id: true },
                        take:   100,
                    },
                },
            },
        },
    });

    return Response.json(requests);
}
