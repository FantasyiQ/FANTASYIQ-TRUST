import type { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const MAX_BYTES   = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
]);

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> }
): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true },
    });
    if (!dues || dues.commissionerId !== user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file     = formData.get('file') as File | null;
    const label    = (formData.get('label') as string | null)?.trim();

    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    if (!label) return Response.json({ error: 'label is required' }, { status: 400 });

    if (!ALLOWED_TYPES.has(file.type)) {
        return Response.json({ error: 'File type not allowed. Accepted: PDF, Word, Excel, TXT, CSV, images.' }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
        return Response.json({ error: 'File exceeds 10 MB limit.' }, { status: 413 });
    }

    const blob = await put(`league-docs/${duesId}/${Date.now()}-${file.name}`, file, {
        access: 'public',
        contentType: file.type,
    });

    const doc = await prisma.leagueDocument.create({
        data: { leagueDuesId: duesId, label, url: blob.url },
    });

    return Response.json({ document: doc }, { status: 201 });
}
