import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeague } from '@/lib/sleeper';

const NON_STARTER = new Set(['BN', 'IR', 'TAXI']);

function allowedPositions(slotPosition: string): string[] {
    switch (slotPosition) {
        case 'FLEX':       return ['RB', 'WR', 'TE'];
        case 'SUPER_FLEX': return ['QB', 'RB', 'WR', 'TE'];
        case 'IDP_FLEX':   return ['LB', 'DL', 'DB', 'DE', 'DT', 'CB', 'S'];
        case 'DEF':        return ['DEF'];
        case 'K':          return ['K'];
        default:           return [slotPosition];
    }
}

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const body = await request.json() as {
        leagueId?: string;
        name?:     string;
        openAt?:   string;
        lockAt?:   string;
        endAt?:    string;
    };

    const { leagueId, name, openAt, lockAt, endAt } = body;
    if (!leagueId || !name?.trim() || !openAt || !lockAt || !endAt) {
        return Response.json({ error: 'leagueId, name, openAt, lockAt, and endAt are required.' }, { status: 400 });
    }

    // Verify league ownership
    const league = await prisma.league.findFirst({
        where: { id: leagueId, userId: user.id },
        select: { id: true, leagueId: true, rosterPositions: true, scoringType: true, scoringSettings: true },
    });
    if (!league) return Response.json({ error: 'League not found.' }, { status: 404 });

    // Build roster config from league's starter positions
    const starters = league.rosterPositions.filter(p => !NON_STARTER.has(p));
    const positions = starters.length > 0 ? starters : ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];

    const rosterConfigJson = {
        slots: positions.map(pos => ({
            position:         pos,
            allowedPositions: allowedPositions(pos),
        })),
    };

    // Build scoring config
    const scoringType = league.scoringType ?? 'std';
    let scoringRules: Record<string, number> = {};

    if (league.scoringSettings) {
        scoringRules = league.scoringSettings as Record<string, number>;
    } else {
        try {
            const sl = await getLeague(league.leagueId);
            scoringRules = (sl.scoring_settings as Record<string, number>) ?? {};
        } catch { /* non-fatal */ }
    }

    const scoringConfigJson = { scoringType, scoring: scoringRules };

    const contest = await prisma.proBowlContest.create({
        data: {
            leagueId:         league.id,
            name:             name.trim(),
            openAt:           new Date(openAt),
            lockAt:           new Date(lockAt),
            endAt:            new Date(endAt),
            isActive:         true,
            rosterConfigJson,
            scoringConfigJson,
        },
        select: { id: true },
    });

    return Response.json({ id: contest.id }, { status: 201 });
}
