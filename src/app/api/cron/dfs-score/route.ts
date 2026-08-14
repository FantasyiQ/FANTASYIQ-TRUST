import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentNflWeek, scoreLineup, type DFSEntry } from '@/lib/dfs';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

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

    try {
    
        const { week: currentWeek, season: currentSeason } = currentNflWeek();
        const now = new Date();

        // Load all non-FINAL contests
        const contests = await prisma.dFSContest.findMany({
            where:   { status: { not: 'FINAL' } },
            include: {
                lineups:     { select: { id: true, userId: true, entriesJson: true } },
                sourceLeague: { select: { scoringType: true, scoringSettings: true } },
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
                const pts     = await scoreLineup(
                    entries, contest.season, contest.week,
                    contest.sourceLeague.scoringType,
                    contest.sourceLeague.scoringSettings as Record<string, number> | null,
                );
                await prisma.dFSLineup.update({
                    where: { id: lineup.id },
                    data:  { totalPoints: pts, locked: isPastWeek },
                });
                totalScored++;
            }

            if (isPastWeek) {
                // Past week → FINAL
                await prisma.dFSContest.update({
                    where: { id: contest.id },
                    data:  { status: 'FINAL' },
                });
                finalised++;
            } else if (contest.week === currentWeek && contest.season === currentSeason) {
                // Transition OPEN → LOCKED once lockAt passes (first kickoff of week)
                if (contest.status === 'OPEN' && contest.lockAt && now >= contest.lockAt) {
                    await prisma.dFSContest.update({
                        where: { id: contest.id },
                        data:  { status: 'LOCKED' },
                    });
                }
                // LOCKED stays LOCKED until the week rolls over (→ FINAL above)
            }
        }
    
        return Response.json({ ok: true, scored: totalScored, finalised });
    } catch (err) {
        captureError(err, { cron: 'dfs-score' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
