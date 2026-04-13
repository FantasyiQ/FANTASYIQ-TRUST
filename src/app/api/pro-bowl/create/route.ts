import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeague } from '@/lib/sleeper';

// Positions that are bench/IR — not part of the starting lineup
const NON_STARTER = new Set(['BN', 'IR', 'TAXI']);

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const body = await request.json() as { leagueName?: string; season?: string; leagueDuesId?: string };
    const { leagueName, season, leagueDuesId } = body;
    if (!leagueName || !season) return Response.json({ error: 'leagueName and season are required.' }, { status: 400 });

    // If a dues tracker ID is supplied, verify ownership
    if (leagueDuesId) {
        const dues = await prisma.leagueDues.findUnique({
            where: { id: leagueDuesId },
            select: { commissionerId: true },
        });
        if (!dues || dues.commissionerId !== user.id) {
            return Response.json({ error: 'Forbidden.' }, { status: 403 });
        }
    }

    // Check for existing contest
    const existing = await prisma.proBowlContest.findFirst({
        where: { commissionerId: user.id, leagueName, season },
        select: { id: true },
    });
    if (existing) return Response.json({ error: 'A contest already exists for this league and season.' }, { status: 409 });

    // Try to load league settings from the synced League record
    const syncedLeague = await prisma.league.findFirst({
        where: { userId: user.id, leagueName: { mode: 'insensitive', equals: leagueName } },
        orderBy: { updatedAt: 'desc' },
        select: { leagueId: true, rosterPositions: true, scoringType: true },
    });

    let rosterPositions: string[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
    let scoringType = 'std';
    let scoringRules: Record<string, number> = {};

    if (syncedLeague) {
        // Starter positions only (exclude BN/IR/TAXI)
        const starters = syncedLeague.rosterPositions.filter(p => !NON_STARTER.has(p));
        if (starters.length > 0) rosterPositions = starters;
        scoringType = syncedLeague.scoringType ?? 'std';

        // Fetch full scoring_settings from Sleeper API
        try {
            const sl = await getLeague(syncedLeague.leagueId);
            scoringRules = (sl.scoring_settings as Record<string, number>) ?? {};
        } catch {
            // Non-fatal — fall back to scoringType only
        }
    }

    const scoringSettings = { rosterPositions, scoringType, scoring: scoringRules };

    const contest = await prisma.proBowlContest.create({
        data: {
            commissionerId: user.id,
            leagueName,
            season,
            week: 18,
            status: 'setup',
            scoringSettings,
            ...(leagueDuesId ? { leagueDuesId } : {}),
        },
        select: { id: true },
    });

    return Response.json({ id: contest.id });
}
