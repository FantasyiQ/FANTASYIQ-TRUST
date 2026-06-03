// GET /api/cron/dss-calculate
// Nightly cron — recomputes Dynasty Skill Score for every user with Sleeper Dynasty leagues.
import { prisma } from '@/lib/prisma';
import { computeAndSaveDss } from '@/lib/dss/compute';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const users = await prisma.user.findMany({
            where: {
                sleeperUserId: { not: null },
                leagues: { some: { platform: 'sleeper', leagueType: 'Dynasty' } },
            },
            select: { id: true },
        });

        let computed = 0;
        let failed   = 0;

        for (const { id } of users) {
            try {
                await computeAndSaveDss(id);
                computed++;
            } catch (err) {
                captureError(err, { cron: 'dss-calculate', userId: id });
                failed++;
            }
        }

        return Response.json({ ok: true, computed, failed });
    } catch (err) {
        captureError(err, { cron: 'dss-calculate' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
