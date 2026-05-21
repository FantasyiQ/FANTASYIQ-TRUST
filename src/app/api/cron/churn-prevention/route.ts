// GET /api/cron/churn-prevention
// Daily cron — scores all active users for churn risk and sends targeted nudges.
import { runChurnDetection } from '@/lib/churn-prevention';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runChurnDetection();
    return Response.json({ ok: true, ...result });
}
