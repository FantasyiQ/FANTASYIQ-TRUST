import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();

        // Find all LeagueDues with a future deadline and at least one unpaid member
        const duesWithDeadlines = await prisma.leagueDues.findMany({
            where: {
                deadline: { not: null, gt: now },
                members: {
                    some: { duesStatus: 'unpaid' },
                },
            },
            select: {
                id:          true,
                leagueName:  true,
                buyInAmount: true,
                deadline:    true,
                members: {
                    where: { duesStatus: 'unpaid' },
                    select: {
                        id:          true,
                        userId:      true,
                        displayName: true,
                    },
                },
            },
        });

        let sent = 0;

        for (const dues of duesWithDeadlines) {
            if (!dues.deadline) continue;

            const msUntilDeadline = dues.deadline.getTime() - now.getTime();
            const daysUntilDeadline = msUntilDeadline / (1000 * 60 * 60 * 24);

            // Determine type + throttle based on urgency
            let notifType: (typeof NotificationType)[keyof typeof NotificationType];
            let throttleMs: number;

            if (daysUntilDeadline < 1) {
                notifType  = NotificationType.DUES_REMINDER_FINAL_HOURS;
                throttleMs = 18_000_000; // 5 hours
            } else if (daysUntilDeadline < 7) {
                notifType  = NotificationType.DUES_REMINDER_DAILY;
                throttleMs = 82_800_000; // 23 hours
            } else if (daysUntilDeadline <= 30) {
                notifType  = NotificationType.DUES_REMINDER_THREE_PER_WEEK;
                throttleMs = 172_800_000; // 2 days
            } else {
                notifType  = NotificationType.DUES_REMINDER_WEEKLY;
                throttleMs = 604_800_000; // 7 days
            }

            const deadlineStr = dues.deadline.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            });

            for (const member of dues.members) {
                if (!member.userId) continue;

                try {
                    await notify({
                        userId:     member.userId,
                        type:       notifType,
                        title:      `Dues reminder: ${dues.leagueName}`,
                        body:       `Your dues of $${dues.buyInAmount} for ${dues.leagueName} are due ${deadlineStr}.`,
                        data: {
                            leagueId:   dues.id, // using duesId as leagueId for navigation
                            leagueName: dues.leagueName,
                            duesId:     dues.id,
                            amount:     dues.buyInAmount,
                            deadline:   dues.deadline.toISOString(),
                        },
                        throttleMs,
                    });
                    sent++;
                } catch (err) {
                    console.error('[cron/dues-reminders] notify failed', member.userId, err);
                }
            }
        }

        return Response.json({ ok: true, dues: duesWithDeadlines.length, sent });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Cron failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
