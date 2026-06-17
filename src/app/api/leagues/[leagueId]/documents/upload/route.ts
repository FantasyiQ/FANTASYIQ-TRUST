export const maxDuration = 60;

import type { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

const MAX_BYTES = 10 * 1024 * 1024;
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

async function assertCommissioner(leagueId: string, userId: string) {
    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: { userId: true },
    });
    return league?.userId === userId;
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(req));
    if (rl.limited) return rl.response!;

    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!await assertCommissioner(leagueId, session.user.id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const file     = formData.get('file') as File | null;
    const label    = (formData.get('label') as string | null)?.trim();

    if (!file)  return Response.json({ error: 'No file provided.' }, { status: 400 });
    if (!label) return Response.json({ error: 'label is required.' }, { status: 400 });

    if (!ALLOWED_TYPES.has(file.type)) {
        return Response.json({ error: 'File type not allowed. Accepted: PDF, Word, Excel, TXT, CSV, images.' }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
        return Response.json({ error: 'File exceeds 10 MB limit.' }, { status: 413 });
    }

    const blob = await put(`league-docs/${leagueId}/${Date.now()}-${file.name}`, file, {
        access:      'public',
        contentType: file.type,
    });

    const doc = await prisma.leagueDocument.create({
        data:   { leagueId, label, url: blob.url },
        select: { id: true, label: true, url: true, createdAt: true },
    });
    return Response.json({ document: doc }, { status: 201 });
}
