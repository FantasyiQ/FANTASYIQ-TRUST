import { prisma } from '@/lib/prisma';
import { auth }   from '@/lib/auth';

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
                    // ownerId intentionally omitted — internal user ID
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
