import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateLineup, type DFSEntry } from '@/lib/dfs';
import { getNflSchedule } from '@/lib/sleeper';

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

    const typedEntries = entries as DFSEntry[];

    // Load contest + source league settings
    const contest = await prisma.dFSContest.findUnique({
        where:   { id: contestId },
        include: { sourceLeague: { select: { platform: true, leagueId: true, rosterPositions: true, scoringType: true, season: true } } },
    });

    if (!contest) return Response.json({ error: 'Contest not found' }, { status: 404 });
    if (contest.status === 'FINAL') {
        return Response.json({ error: 'Contest is over' }, { status: 409 });
    }

    // Per-player lock: block swapping any player whose game has already kicked off
    const schedule = await getNflSchedule(String(contest.season), contest.week);
    if (Object.keys(schedule).length > 0) {
        const now = Date.now();

        const existingLineup = await prisma.dFSLineup.findUnique({
            where:  { contestId_userId: { contestId, userId: session.user.id } },
            select: { entriesJson: true },
        });
        const existing = (existingLineup?.entriesJson as DFSEntry[] ?? []);
        const bySlot   = new Map(existing.map(e => [e.slot, e.playerId]));

        // IDs of players being removed from their slots
        const removedIds = typedEntries
            .filter(e => bySlot.get(e.slot) && bySlot.get(e.slot) !== e.playerId)
            .map(e => bySlot.get(e.slot)!);

        if (removedIds.length > 0) {
            const removedPlayers = await prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: removedIds } },
                select: { playerId: true, fullName: true, team: true },
            });
            for (const player of removedPlayers) {
                const kickoff = player.team ? schedule[player.team] : null;
                if (kickoff && now >= kickoff) {
                    return Response.json({
                        error: `${player.fullName ?? 'That player'}'s game has started — swap them before kickoff`,
                    }, { status: 409 });
                }
            }
        }
    }

    // Verify the user is a member of this league
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

    const validation = await validateLineup(typedEntries, contest.sourceLeague.rosterPositions as string[]);
    if (!validation.valid) {
        return Response.json({ error: validation.error }, { status: 422 });
    }

    const lineup = await prisma.dFSLineup.upsert({
        where:  { contestId_userId: { contestId, userId: session.user.id } },
        create: { contestId, userId: session.user.id, entriesJson: typedEntries, totalPoints: 0 },
        update: { entriesJson: typedEntries },
    });

    return Response.json(lineup, { status: 200 });
}
