import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// DELETE — remove a document link
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ duesId: string; docId: string }> },
): Promise<Response> {
    const { duesId, docId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({ where: { id: duesId }, select: { commissionerId: true } });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const doc = await prisma.leagueDocument.findUnique({ where: { id: docId }, select: { leagueDuesId: true } });
    if (!doc || doc.leagueDuesId !== duesId) return Response.json({ error: 'Document not found.' }, { status: 404 });

    await prisma.leagueDocument.delete({ where: { id: docId } });
    return Response.json({ success: true });
}
