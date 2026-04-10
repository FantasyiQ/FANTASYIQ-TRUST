import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET — list documents for a league
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({ where: { id: duesId }, select: { commissionerId: true } });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const docs = await prisma.leagueDocument.findMany({
        where: { leagueDuesId: duesId },
        select: { id: true, label: true, url: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });

    return Response.json({ documents: docs });
}

// POST — add a document link
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({ where: { id: duesId }, select: { commissionerId: true } });
    if (!dues || dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as { label?: string; url?: string };
    const label = body.label?.trim();
    const url   = body.url?.trim();

    if (!label) return Response.json({ error: 'Label is required.' }, { status: 400 });
    if (!url)   return Response.json({ error: 'URL is required.' }, { status: 400 });

    // Basic URL validation
    try { new URL(url); } catch { return Response.json({ error: 'Invalid URL.' }, { status: 400 }); }

    const doc = await prisma.leagueDocument.create({
        data: { leagueDuesId: duesId, label, url },
        select: { id: true, label: true, url: true, createdAt: true },
    });

    return Response.json({ document: doc });
}
