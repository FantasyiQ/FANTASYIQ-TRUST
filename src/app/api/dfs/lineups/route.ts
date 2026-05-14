import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateLineup, type DFSEntry } from '@/lib/dfs';

/**
 * POST /api/dfs/lineups
 *
 * Body: { contestId: string; entries: DFSEntry[] }
 *
 * Validates league membership, roster template, and contest status,
 * then upserts the user's lineup.
 */
export async function POST(request: Request): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { contestId, entries } = body as Record<string, unknown>;

    if (typeof contestId !== 'string') return Response.json({ error: 'contestId required' }, { status: 400 });
    if (!Array.isArray(entries))        return Response.json({ error: 'entries must be an array' }, { status: 400 });

    // Load contest + source league settings
    const contest = await prisma.dFSContest.findUnique({
        where:   { id: contestId },
        include: { sourceLeague: { select: { platform: true, leagueId: true, rosterPositions: true, scoringType: true, season: true } } },
    });

    if (!contest) return Response.json({ error: 'Contest not found' }, { status: 404 });
    if (contest.status !== 'OPEN') {
        return Response.json({ error: 'Contest is no longer accepting lineups' }, { status: 409 });
    }

    // Verify the user is a member of this league (has a matching League record)
    const membership = await prisma.league.findFirst({
        where: {
            userId:   session.user.id,
            platform: contest.platform,
            leagueId: contest.externalLeagueId,
        },
    });
    if (!membership) {
        return Response.json({ error: 'You are not a member of this league' }, { status: 403 });
    }

    // Validate entries
    const typedEntries = entries as DFSEntry[];
    const validation   = await validateLineup(typedEntries, contest.sourceLeague.rosterPositions as string[]);
    if (!validation.valid) {
        return Response.json({ error: validation.error }, { status: 422 });
    }

    // Upsert lineup
    const lineup = await prisma.dFSLineup.upsert({
        where:  { contestId_userId: { contestId, userId: session.user.id } },
        create: { contestId, userId: session.user.id, entriesJson: typedEntries, totalPoints: 0 },
        update: { entriesJson: typedEntries },
    });

    return Response.json(lineup, { status: 200 });
}
