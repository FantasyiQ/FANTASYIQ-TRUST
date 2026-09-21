// GET /api/cron/defense-vs-position
// Runs weekly (Tuesday, after that week's Monday Night Football final —
// same day as /api/cron/power-rankings and /api/cron/projection-accuracy)
// and records how many real fantasy points each real NFL defense allowed
// to each position for the just-finished week. See
// src/lib/rankings/defenseVsPosition.ts.

import { getNflState } from '@/lib/sleeper';
import { recordWeeklyDefenseVsPosition } from '@/lib/rankings/defenseVsPosition';
import { captureError } from '@/lib/sentry';
import { withCronLog } from '@/lib/cron-logger';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const url = new URL(request.url);
        const weekParam = url.searchParams.get('week');

        const result = await withCronLog('defense-vs-position', async () => {
            const nflState = await getNflState();
            // Manual ?week= param backfills a specific already-played week
            // (idempotent upsert — safe to re-run for any week, past or
            // present); the normal cron trigger always targets whichever
            // week just finished.
            const targetWeek = weekParam ? parseInt(weekParam, 10) : nflState.week - 1;

            if (targetWeek < 1) {
                return { recorded: 0, message: 'No completed week yet this season' };
            }

            const { recorded } = await recordWeeklyDefenseVsPosition(nflState.season, targetWeek);
            return { recorded, message: `Week ${targetWeek}: ${recorded} defense-position rows recorded` };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'defense-vs-position' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
