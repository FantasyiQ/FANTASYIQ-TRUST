import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

async function assertCommissioner(leagueId: string, userId: string) {
    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: { userId: true },
    });
    return league?.userId === userId;
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ leagueId: string; docId: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(req));
    if (rl.limited) return rl.response!;

    const { leagueId, docId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!await assertCommissioner(leagueId, session.user.id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const doc = await prisma.leagueDocument.findUnique({
        where:  { id: docId },
        select: { leagueId: true },
    });
    if (!doc || doc.leagueId !== leagueId) {
        return Response.json({ error: 'Document not found.' }, { status: 404 });
    }

    await prisma.leagueDocument.delete({ where: { id: docId } });
    return Response.json({ success: true });
}
