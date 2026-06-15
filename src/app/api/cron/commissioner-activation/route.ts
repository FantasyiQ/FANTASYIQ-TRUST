// POST /api/cron/commissioner-activation
// Daily cron — finds commissioners stuck at each activation stage and nudges them.
import { nudgeStuckCommissioners } from '@/lib/commissioner-activation';
import { withCronLog } from '@/lib/cron-logger';
import { captureError } from '@/lib/sentry';

export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
    
        const result = await withCronLog('commissioner-activation', async () => {
            const r = await nudgeStuckCommissioners();
            return { processed: (r.nudged ?? 0) + (r.skipped ?? 0), message: `${r.nudged ?? 0} nudged · ${r.skipped ?? 0} skipped` };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'commissioner-activation' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
