import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST — claim an unclaimed commissioner profile
export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const commissioner = await prisma.lFCommissioner.findUnique({ where: { id } });
    if (!commissioner) return Response.json({ error: 'Commissioner not found' }, { status: 404 });
    if (commissioner.claimed) return Response.json({ error: 'Already claimed' }, { status: 409 });

    // Check user doesn't already own another commissioner profile
    const existing = await prisma.lFCommissioner.findUnique({ where: { ownerId: userId } });
    if (existing) {
        return Response.json({ error: 'You already own a commissioner profile' }, { status: 409 });
    }

    const updated = await prisma.lFCommissioner.update({
        where: { id },
        data:  { ownerId: userId, claimed: true },
    });

    return Response.json(updated);
}
