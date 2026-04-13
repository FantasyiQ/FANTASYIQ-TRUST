import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLockedTeams, normalizeTeam } from '@/lib/nfl-schedule';

interface LineupSlot {
    position: string;
    playerName: string;
    nflTeam: string;
}

const DEFAULT_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ contestId: string }> },
): Promise<Response> {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const contest = await prisma.proBowlContest.findUnique({
        where: { id: contestId },
        select: { id: true, status: true, season: true, week: true, scoringSettings: true },
    });
    if (!contest) return Response.json({ error: 'Contest not found.' }, { status: 404 });
    if (contest.status !== 'open') return Response.json({ error: 'Contest is not open for entries.' }, { status: 400 });

    const settings = contest.scoringSettings as { rosterPositions?: string[] } | null;
    const requiredPositions = settings?.rosterPositions ?? DEFAULT_POSITIONS;

    const body = await request.json() as { lineup?: LineupSlot[] };
    const { lineup } = body;
    if (!lineup || !Array.isArray(lineup) || lineup.length !== requiredPositions.length) {
        return Response.json({ error: `Lineup must have exactly ${requiredPositions.length} players.` }, { status: 400 });
    }

    // Fetch which teams are locked (game started)
    const lockedTeams = await getLockedTeams(contest.season, contest.week);

    // Load existing entry (needed to preserve locked slots)
    const existingEntry = await prisma.proBowlEntry.findUnique({
        where: { contestId_userId: { contestId, userId: user.id } },
        select: { lineup: true },
    });
    const savedSlots = (existingEntry?.lineup ?? []) as unknown as LineupSlot[];

    // Build the final lineup: for locked slots keep the saved value, accept new value for unlocked
    const finalLineup: LineupSlot[] = lineup.map((slot, i) => {
        const abbrev = normalizeTeam(slot.nflTeam);
        const isLocked = abbrev ? lockedTeams.has(abbrev) : false;
        if (isLocked) {
            // Preserve saved slot (or keep blank if no prior entry — they missed their window)
            return savedSlots[i] ?? { position: slot.position, playerName: '', nflTeam: '' };
        }
        if (!slot.playerName?.trim() || !slot.nflTeam?.trim() || !slot.position) {
            return { position: slot.position, playerName: '', nflTeam: '' }; // blank allowed for non-locked
        }
        return slot;
    });

    // Validate: all non-locked slots must be filled
    for (const slot of finalLineup) {
        if (!slot.playerName?.trim() || !slot.nflTeam?.trim()) {
            const abbrev = normalizeTeam(slot.nflTeam ?? '');
            const isLocked = abbrev ? lockedTeams.has(abbrev) : false;
            if (!isLocked) {
                return Response.json({ error: `Fill in the ${slot.position} slot or that game has not started.` }, { status: 400 });
            }
        }
    }

    const entry = await prisma.proBowlEntry.upsert({
        where: { contestId_userId: { contestId, userId: user.id } },
        create: { contestId, userId: user.id, lineup: finalLineup as unknown as import('@prisma/client').Prisma.JsonArray },
        update: { lineup: finalLineup as unknown as import('@prisma/client').Prisma.JsonArray, updatedAt: new Date() },
        select: { id: true },
    });

    return Response.json({ id: entry.id, lockedCount: lockedTeams.size });
}
