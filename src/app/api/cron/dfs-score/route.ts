import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentNflWeek, scoreLineup, type DFSEntry } from '@/lib/dfs';

export const maxDuration = 60;

/**
 * GET /api/cron/dfs-score
 *
 * Runs hourly (or on-demand).  For every OPEN/LOCKED DFS contest whose week
 * is less than the current NFL week:
 *   1. Score all lineups using PlayerProjection data.
 *   2. Lock the lineup rows.
 *   3. Mark the contest FINAL.
 *
 * For OPEN contests in the current week (games are live):
 *   1. Score all lineups (live estimate using latest projections).
 *   2. Status remains OPEN until the week advances.
 *
 * This means totalPoints stays fresh throughout the week, and the contest
 * goes FINAL automatically once the week rolls over.
 */
export async function GET(request: NextRequest): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { week: currentWeek, season: currentSeason } = currentNflWeek();

    // Load all non-FINAL contests
    const contests = await prisma.dFSContest.findMany({
        where:   { status: { not: 'FINAL' } },
        include: {
            lineups:     { select: { id: true, userId: true, entriesJson: true } },
            sourceLeague: { select: { scoringType: true } },
        },
    });

    let totalScored = 0;
    let finalised   = 0;

    for (const contest of contests) {
        const isPastWeek =
            contest.season < currentSeason ||
            (contest.season === currentSeason && contest.week < currentWeek);

        // Score every lineup
        for (const lineup of contest.lineups) {
            const entries = lineup.entriesJson as DFSEntry[];
            const pts     = await scoreLineup(entries, contest.season, contest.week, contest.sourceLeague.scoringType);
            await prisma.dFSLineup.update({
                where: { id: lineup.id },
                data:  { totalPoints: pts, locked: isPastWeek },
            });
            totalScored++;
        }

        // Past weeks → FINAL; current week → LOCKED (lineups in progress)
        if (isPastWeek) {
            await prisma.dFSContest.update({
                where: { id: contest.id },
                data:  { status: 'FINAL' },
            });
            finalised++;
        } else if (contest.status === 'OPEN' && contest.week === currentWeek && contest.season === currentSeason) {
            // Keep OPEN; scores are live estimates only
        }
    }

    return Response.json({ ok: true, scored: totalScored, finalised });
}
