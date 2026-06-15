// GET /api/cron/upsell-engine
// Daily cron — identifies high-value upsell targets and sends targeted in-app prompts.
import { runUpsellEngine } from '@/lib/upsell-engine';
import { withCronLog } from '@/lib/cron-logger';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('upsell-engine', async () => {
            const r = await runUpsellEngine();
            return { processed: r.assessed, message: `${r.opportunities} opportunities · ${r.nudged} nudged` };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'upsell-engine' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
