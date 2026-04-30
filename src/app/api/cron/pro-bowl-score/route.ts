import { prisma } from '@/lib/prisma';
import { scoreProBowlContest } from '@/lib/pro-bowl/scoring';
import { fetchLiveStats } from '@/lib/pro-bowl/stats';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find all contests currently in the scoring window
    const contests = await prisma.proBowlContest.findMany({
        where: {
            isActive: true,
            lockAt:   { lte: new Date() }, // contest has locked
            endAt:    { gte: new Date() }, // contest not finished
        },
        select: { id: true },
    });

    if (!contests.length) {
        return Response.json({ ok: true, message: 'No active contests' });
    }

    // Pull live stats once per cycle
    const liveStats = await fetchLiveStats();

    // Score each contest
    for (const contest of contests) {
        await scoreProBowlContest(contest.id, liveStats);
    }

    return Response.json({ ok: true, scored: contests.length });
}
