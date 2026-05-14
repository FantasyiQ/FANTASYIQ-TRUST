import { prisma } from '@/lib/prisma';

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const league = await prisma.lFLeague.findUnique({
        where:   { id },
        include: {
            commissioner: true,
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
