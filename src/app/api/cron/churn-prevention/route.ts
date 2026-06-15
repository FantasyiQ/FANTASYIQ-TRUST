// GET /api/cron/churn-prevention
// Daily cron — scores all active users for churn risk and sends targeted nudges.
import { runChurnDetection } from '@/lib/churn-prevention';
import { withCronLog } from '@/lib/cron-logger';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('churn-prevention', async () => {
            const r = await runChurnDetection();
            return { processed: r.assessed, message: `${r.atRisk} at risk · ${r.nudged} nudged` };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'churn-prevention' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
