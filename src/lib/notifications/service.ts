import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { NotificationType, NotificationPayload } from './types';
import { THROTTLE_MS } from './types';
import { sendEmail } from './email';
import { renderTemplate } from './templates';
import { getPusherServer, userChannel } from '@/lib/pusher';
import { captureError } from '@/lib/sentry';

export interface CreateNotificationOptions {
  userId:      string;
  type:        NotificationType;
  title:       string;
  body:        string;
  data?:       NotificationPayload;
  email?:      boolean;   // default true
  inApp?:      boolean;   // default true
  expiresAt?:  Date;
  // Throttle: skip if same type was sent to this user within X ms
  throttleMs?: number;
}

/**
 * Core function — creates an in-app notification and optionally sends email.
 * Handles preference lookups and throttle checks.
 */
export async function notify(opts: CreateNotificationOptions): Promise<void> {
  const {
    userId, type, title, body, data,
    email    = true,
    inApp    = true,
    expiresAt,
    throttleMs,
  } = opts;

  // ── Throttle check ── use per-type map, caller can override ─────────────
  const effectiveThrottle = throttleMs ?? THROTTLE_MS[type];
  if (effectiveThrottle) {
    const since = new Date(Date.now() - effectiveThrottle);
    const recent = await prisma.notification.findFirst({
      where: { userId, type, createdAt: { gte: since } },
      select: { id: true },
    });
    if (recent) return;
  }

  // ── Preference check ─────────────────────────────────────────────────────
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId, type: { in: [type, '*'] } },
    select: { type: true, email: true, inApp: true },
  });
  const globalPref = prefs.find(p => p.type === '*');
  const typePref   = prefs.find(p => p.type === type);

  const sendInApp  = inApp  && (typePref?.inApp  ?? globalPref?.inApp  ?? true);
  const sendEmailY = email  && (typePref?.email   ?? globalPref?.email  ?? true);

  // ── In-app notification ───────────────────────────────────────────────────
  let notifId: string | undefined;
  if (sendInApp) {
    const notif = await prisma.notification.create({
      data: { userId, type, title, body, data: (data ?? {}) as Prisma.InputJsonValue, expiresAt },
      select: { id: true },
    });
    notifId = notif.id;

    // ── Push real-time event (best-effort, non-blocking) ─────────────────
    getPusherServer()?.trigger(
      userChannel(userId),
      'notification',
      { id: notif.id, type, title, body, data: data ?? {}, createdAt: new Date().toISOString() },
    ).catch(() => {}); // never throw
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (sendEmailY) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, name: true },
    });
    if (user?.email) {
      const html = renderTemplate(type, { title, body, data });
      await sendEmail({
        to:      user.email,
        subject: title,
        html,
      }).catch(err => {
        captureError(err, { context: 'notify:email', type, userId });
      });

      if (notifId) {
        await prisma.notification.update({
          where: { id: notifId },
          data:  { emailSent: true, emailSentAt: new Date() },
        });
      }
    }
  }
}

/**
 * Notify multiple users at once (e.g. all league members).
 */
export async function notifyMany(
  userIds: string[],
  opts: Omit<CreateNotificationOptions, 'userId'>,
): Promise<void> {
  await Promise.allSettled(userIds.map(uid => notify({ ...opts, userId: uid })));
}
