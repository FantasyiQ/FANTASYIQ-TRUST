// GET /api/cron/predictive-models
// Daily cron — recomputes churn, conversion, upgrade, and league survival probabilities for all users.
import { runPredictiveModels } from '@/lib/predictive-models';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runPredictiveModels();
    return Response.json({ ok: true, ...result });
}
