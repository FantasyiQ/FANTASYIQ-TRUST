import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ duesId: string }> }): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const url = new URL(_req.url);
    const includeProposals = url.searchParams.get('include') === 'proposals';

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        include: {
            members: { select: { id: true, displayName: true, teamName: true, duesStatus: true }, orderBy: { createdAt: 'asc' } },
            payoutSpots: { orderBy: { sortOrder: 'asc' } },
            ...(includeProposals ? {
                proposals: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        items: { include: { payoutSpot: true, member: true } },
                        poll: { include: { votes: true } },
                    },
                },
            } : {}),
        },
    });

    if (!dues) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    return Response.json(dues);
}
