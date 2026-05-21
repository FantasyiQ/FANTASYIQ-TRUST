// GET /api/cron/league-health
// Daily cron — scores every synced league for health and nudges commissioners of unhealthy leagues.
import { runLeagueHealthCheck } from '@/lib/league-health';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runLeagueHealthCheck();
    return Response.json({ ok: true, ...result });
}
