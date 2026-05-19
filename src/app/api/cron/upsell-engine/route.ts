// GET /api/cron/upsell-engine
// Daily cron — identifies high-value upsell targets and sends targeted in-app prompts.
import { runUpsellEngine } from '@/lib/upsell-engine';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runUpsellEngine();
    return Response.json({ ok: true, ...result });
}
