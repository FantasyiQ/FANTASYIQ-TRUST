import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';

export const maxDuration = 300;

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Find all active LeagueDues with unpaid members
        const activeDues = await prisma.leagueDues.findMany({
            where: {
                status: { in: ['active', 'setup'] },
                members: {
                    some: { duesStatus: 'unpaid' },
                },
            },
            select: {
                id:            true,
                leagueName:    true,
                commissionerId: true,
                members: {
                    where:  { duesStatus: 'unpaid' },
                    select: { displayName: true },
                },
            },
        });

        let sent = 0;

        for (const dues of activeDues) {
            const unpaidNames = dues.members.map(m => m.displayName);
            if (unpaidNames.length === 0) continue;

            try {
                await notify({
                    userId: dues.commissionerId,
                    type:   NotificationType.COMMISSIONER_UNPAID_DIGEST,
                    title:  `${unpaidNames.length} member${unpaidNames.length !== 1 ? 's' : ''} still owe dues — ${dues.leagueName}`,
                    body:   `${unpaidNames.length} member${unpaidNames.length !== 1 ? 's' : ''} in ${dues.leagueName} have not yet paid their dues.`,
                    data: {
                        leagueId:    dues.id,
                        leagueName:  dues.leagueName,
                        duesId:      dues.id,
                        unpaidNames,
                    },
                    throttleMs: SIX_DAYS_MS,
                });
                sent++;
            } catch (err) {
                console.error('[cron/commissioner-digest] notify failed', dues.commissionerId, err);
            }
        }

        return Response.json({ ok: true, leagues: activeDues.length, sent });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Cron failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
