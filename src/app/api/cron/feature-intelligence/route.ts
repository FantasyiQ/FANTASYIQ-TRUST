// GET /api/cron/feature-intelligence
// Weekly cron — analyses WoW feature trends and sends personalised feature suggestions to users.
import { runFeatureIntelligence } from '@/lib/feature-intelligence';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trends, nudged, analyzed } = await runFeatureIntelligence();

    const rising   = trends.filter(t => t.direction === 'rising').map(t => t.feature);
    const declining= trends.filter(t => t.direction === 'declining').map(t => t.feature);
    const abandoned= trends.filter(t => t.direction === 'abandoned').map(t => t.feature);

    return Response.json({ ok: true, analyzed, nudged, rising, declining, abandoned });
}
