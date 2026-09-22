import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// PATCH /api/leagues/reorder
// Body: { leagueIds: string[]; type?: 'league' | 'connected' } — the full
// new display order for one My Leagues section (e.g. all of a user's
// Sleeper leagues, or all of their manually-connected leagues). Writes
// sequential sortOrder values (0..n-1) for exactly those rows. A row left
// out of the list (e.g. one newly synced after the last reorder) keeps
// sortOrder null and sorts after every explicitly-ordered row.
//
// `type` picks which model the ids belong to — the two "My Leagues"
// sections (synced League rows vs. manually-tracked ConnectedLeague rows)
// are entirely separate tables, not just a filter on one table.
export async function PATCH(request: NextRequest): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as { leagueIds?: string[]; type?: 'league' | 'connected' };
    const leagueIds = body.leagueIds;
    const type = body.type ?? 'league';
    if (!Array.isArray(leagueIds) || leagueIds.length === 0 || leagueIds.length > 200) {
        return Response.json({ error: 'leagueIds must be a non-empty array' }, { status: 400 });
    }
    if (type !== 'league' && type !== 'connected') {
        return Response.json({ error: 'type must be "league" or "connected"' }, { status: 400 });
    }

    // Verify every row belongs to this user before writing anything — a
    // partial/foreign ID list is rejected outright rather than silently
    // reordering only the valid subset.
    const ownedCount = type === 'league'
        ? await prisma.league.count({ where: { id: { in: leagueIds }, userId } })
        : await prisma.connectedLeague.count({ where: { id: { in: leagueIds }, userId } });
    if (ownedCount !== leagueIds.length) {
        return Response.json({ error: 'One or more leagues not found' }, { status: 404 });
    }

    await prisma.$transaction(
        leagueIds.map((id, index) =>
            type === 'league'
                ? prisma.league.update({ where: { id }, data: { sortOrder: index } })
                : prisma.connectedLeague.update({ where: { id }, data: { sortOrder: index } }),
        ),
    );

    return Response.json({ ok: true });
}
