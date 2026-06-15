// GET /api/cron/prs-calculate
// Nightly cron — recalculates PRS for every user who has at least one PRS event.
import { prisma } from '@/lib/prisma';
import { calculateAndSavePrs } from '@/lib/prs';
import { withCronLog } from '@/lib/cron-logger';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('prs-calculate', async () => {
            const rows = await prisma.prsEvent.findMany({
                distinct: ['userId'],
                select: { userId: true },
            });

            let computed = 0;
            let failed   = 0;

            for (const { userId } of rows) {
                try {
                    await calculateAndSavePrs(userId);
                    computed++;
                } catch (err) {
                    captureError(err, { cron: 'prs-calculate', userId });
                    failed++;
                }
            }

            return { processed: computed, errors: failed, message: `${computed} computed · ${failed} failed` };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'prs-calculate' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
