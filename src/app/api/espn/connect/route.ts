// POST /api/espn/connect
// Called by the FiQ ESPN Connector Chrome extension flow.
// The extension reads ESPN cookies and sends them to this endpoint via the
// FiQ page (which already has the user's session). Credentials are saved to
// the user record and all existing ESPN leagues are re-queued for sync.

import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { espn_s2, swid } = body as { espn_s2?: string; swid?: string };

    // Strip whitespace (defensive — extension shouldn't send any)
    const cleanS2   = espn_s2?.replace(/\s/g, '') ?? '';
    const cleanSwid = swid?.replace(/\s/g, '')    ?? '';

    if (!cleanS2 || !cleanSwid) {
        return Response.json({ error: 'espn_s2 and swid are required' }, { status: 400 });
    }

    // SWID must be a UUID wrapped in braces: {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}
    if (!cleanSwid.startsWith('{') || !cleanSwid.endsWith('}')) {
        return Response.json({ error: 'invalid_swid_format' }, { status: 400 });
    }

    // Save credentials to the user record
    await prisma.user.update({
        where: { id: userId },
        data:  { espnS2: cleanS2, swid: cleanSwid },
    });

    // Count existing ESPN leagues so the UI can tell the user what will re-sync
    const espnLeagueCount = await prisma.league.count({
        where: { userId, platform: 'espn' },
    });

    return Response.json({ ok: true, espnLeagueCount });
}
