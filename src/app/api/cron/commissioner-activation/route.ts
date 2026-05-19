// POST /api/cron/commissioner-activation
// Daily cron — finds commissioners stuck at each activation stage and nudges them.
import { nudgeStuckCommissioners } from '@/lib/commissioner-activation';

export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await nudgeStuckCommissioners();
    return Response.json({ ok: true, ...result });
}
