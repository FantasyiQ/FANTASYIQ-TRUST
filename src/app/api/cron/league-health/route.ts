// GET /api/cron/league-health
// Daily cron — scores every synced league for health and nudges commissioners of unhealthy leagues.
import { runLeagueHealthCheck } from '@/lib/league-health';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
    
        const result = await runLeagueHealthCheck();
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'league-health' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
