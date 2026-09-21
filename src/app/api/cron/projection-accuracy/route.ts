// GET /api/cron/projection-accuracy
// Runs weekly (Tuesday, after that week's Monday Night Football final —
// same day as /api/cron/power-rankings) and records how close FIQ's
// projection actually came to real results for every player who played the
// just-finished week. See src/lib/rankings/projectionAccuracy.ts.

import { getNflState } from '@/lib/sleeper';
import { recordWeeklyProjectionAccuracy } from '@/lib/rankings/projectionAccuracy';
import { captureError } from '@/lib/sentry';
import { withCronLog } from '@/lib/cron-logger';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('projection-accuracy', async () => {
            const nflState = await getNflState();
            const justFinishedWeek = nflState.week - 1;

            if (justFinishedWeek < 1) {
                return { recorded: 0, message: 'No completed week yet this season' };
            }

            const { recorded } = await recordWeeklyProjectionAccuracy(nflState.season, justFinishedWeek);
            return { recorded, message: `Week ${justFinishedWeek}: ${recorded} player-weeks recorded` };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'projection-accuracy' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
