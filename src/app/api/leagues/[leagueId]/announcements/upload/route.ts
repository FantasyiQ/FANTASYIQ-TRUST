import type { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED   = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {

    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: { userId: true },
    });
    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file     = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file provided.' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return Response.json({ error: 'Images only: PNG, JPEG, GIF, WebP.' }, { status: 415 });
    if (file.size > MAX_BYTES) return Response.json({ error: 'Max file size is 5 MB.' }, { status: 413 });

    const blob = await put(
        `announcements/${leagueId}/${Date.now()}-${file.name}`,
        file,
        { access: 'public', contentType: file.type },
    );
    return Response.json({ url: blob.url }, { status: 201 });
}
