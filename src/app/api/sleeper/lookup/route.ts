import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getSleeperUser, getSleeperLeagues, getNflState } from '@/lib/sleeper';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { username?: string };
    const username = body.username?.trim();
    if (!username) return Response.json({ error: 'username is required' }, { status: 400 });

    try {
        const [sleeperUser, nflState] = await Promise.all([
            getSleeperUser(username),
            getNflState(),
        ]);
        const leagues = await getSleeperLeagues(sleeperUser.user_id, nflState.season);
        return Response.json({ user: sleeperUser, leagues, season: nflState.season });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch Sleeper data';
        if (message.includes('404')) return Response.json({ error: 'Sleeper username not found' }, { status: 404 });
        return Response.json({ error: message }, { status: 502 });
    }
}
