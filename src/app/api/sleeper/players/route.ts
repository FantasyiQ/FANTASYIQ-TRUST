import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getPlayers } from '@/lib/sleeper';

export async function GET(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = request.nextUrl.searchParams.get('ids');
    if (!raw) return Response.json({ error: 'ids query param is required' }, { status: 400 });

    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);

    try {
        const all = await getPlayers();
        const result: Record<string, typeof all[string]> = {};
        for (const id of ids) { if (all[id]) result[id] = all[id]; }
        return Response.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch players';
        return Response.json({ error: message }, { status: 502 });
    }
}
