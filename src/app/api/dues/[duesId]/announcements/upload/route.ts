import type { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const MAX_BYTES   = 5 * 1024 * 1024; // 5 MB
const ALLOWED     = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'Not found' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true },
    });
    if (!dues || dues.commissionerId !== user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file     = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file provided.' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return Response.json({ error: 'Images only: PNG, JPEG, GIF, WebP.' }, { status: 415 });
    if (file.size > MAX_BYTES) return Response.json({ error: 'Max file size is 5 MB.' }, { status: 413 });

    const blob = await put(
        `announcements/${duesId}/${Date.now()}-${file.name}`,
        file,
        { access: 'public', contentType: file.type },
    );

    return Response.json({ url: blob.url }, { status: 201 });
}
