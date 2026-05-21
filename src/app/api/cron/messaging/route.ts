// GET /api/cron/messaging
// Daily cron — Engine 8: Automated Messaging Layer.
// Handles subscription renewal reminders (3 days before billing) and
// PRS sync-staleness reminders (leagues not refreshed in 7-10 days).
//
// Uses the full notify() service — respects user preferences, throttles,
// sends email via Resend, and fires Pusher real-time events.

import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
    
        const now = Date.now();
        let renewalsSent = 0;
        let syncRemindersSent = 0;
    
        // ── 1. Subscription renewal reminders ────────────────────────────────────
        // Find active subs renewing in the next 1–4 days.
        const renewalWindow = {
            gte: new Date(now + DAY_MS),       // at least 1 day away (not today)
            lte: new Date(now + 4 * DAY_MS),   // within 4 days
        };
    
        const renewingSubs = await prisma.subscription.findMany({
            where: {
                status:           { in: ['active', 'trialing'] },
                cancelAtPeriodEnd: false,          // skip subs already set to cancel
                currentPeriodEnd:  renewalWindow,
            },
            select: {
                userId:          true,
                tier:            true,
                leagueName:      true,
                currentPeriodEnd:true,
            },
        });
    
        // Deduplicate by userId — one reminder per user regardless of sub count
        const renewalUserMap = new Map<string, typeof renewingSubs[0]>();
        for (const sub of renewingSubs) {
            if (!renewalUserMap.has(sub.userId)) renewalUserMap.set(sub.userId, sub);
        }
    
        for (const [userId, sub] of renewalUserMap) {
            const renewDate = sub.currentPeriodEnd!;
            const daysAway  = Math.round((renewDate.getTime() - now) / DAY_MS);
            const tierLabel = sub.tier.replace('COMMISSIONER_', '').replace('PLAYER_', '').replace('_', ' ');
            const leagueNote = sub.leagueName ? ` for ${sub.leagueName}` : '';
    
            await notify({
                userId,
                type:  NotificationType.PLAN_RENEWAL_UPCOMING,
                title: `Your FiQ subscription renews in ${daysAway} day${daysAway !== 1 ? 's' : ''}`,
                body:  `Your ${tierLabel} plan${leagueNote} renews on ${renewDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. No action needed.`,
                data:  { deadline: renewDate.toISOString(), tier: sub.tier },
                email: true,
                inApp: true,
            }).catch(() => {});
            renewalsSent++;
        }
    
        // ── 2. PRS / sync staleness reminders ────────────────────────────────────
        // Target: users with leagues not synced in 7–13 days (churn cron handles 14+).
        // Only for users with feature history (they use FiQ actively).
        const sevenDaysAgo    = new Date(now - 7  * DAY_MS);
        const thirteenDaysAgo = new Date(now - 13 * DAY_MS);
        const thirtyDaysAgo   = new Date(now - 30 * DAY_MS);
    
        const staleSyncUsers = await prisma.user.findMany({
            where: {
                featureEvents: { some: { createdAt: { gte: thirtyDaysAgo } } },
                leagues: {
                    some: {
                        lastSyncedAt: { gte: thirteenDaysAgo, lte: sevenDaysAgo },
                    },
                },
            },
            select: {
                id: true,
                leagues: {
                    select:  { leagueName: true, lastSyncedAt: true },
                    orderBy: { lastSyncedAt: 'desc' },
                    take:    1,
                },
            },
        });
    
        for (const user of staleSyncUsers) {
            const league   = user.leagues[0];
            const lastSync = league?.lastSyncedAt;
            if (!lastSync) continue;
    
            const daysStale = Math.round((now - lastSync.getTime()) / DAY_MS);
    
            await notify({
                userId: user.id,
                type:   NotificationType.LEAGUE_SYNC_REMINDER,
                title:  'Sync your league to keep your PRS fresh',
                body:   `${league.leagueName} hasn't synced in ${daysStale} days. Your Player Reliability Score and power rankings may be out of date.`,
                data:   { leagueName: league.leagueName },
                email:  false,   // in-app only for sync reminders — email is too aggressive
                inApp:  true,
            }).catch(() => {});
            syncRemindersSent++;
        }
    
        return Response.json({
            ok: true,
            renewalsSent,
            syncRemindersSent,
        });
    } catch (err) {
        captureError(err, { cron: 'messaging' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
