import { Resend } from 'resend';
import { FROM_NAME } from '@/lib/constants';
import { prisma } from '@/lib/prisma';

// Lazy singleton — instantiated at call time so missing env var at build time
// doesn't cause a module-level throw during static analysis / page data collection.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set.');
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export interface EmailOptions {
  to:      string;
  subject: string;
  html:    string;
  from?:   string;
  type?:   string; // e.g. notification type for tracking
}

// Errors that are not worth retrying (permanent failures).
const PERMANENT_ERRORS = ['invalid_api_key', 'invalid_to', 'domain_not_verified'];

function isPermanent(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return PERMANENT_ERRORS.some(e => msg.includes(e));
  }
  return false;
}

/**
 * Send a transactional email via Resend with up to 3 attempts (exponential backoff).
 * Logs every send attempt to EmailLog for delivery tracking.
 * Delays: 1 s → 2 s → give up.
 * Permanent errors (invalid key, bad address) are not retried.
 */
export async function sendEmail({ to, subject, html, from, type }: EmailOptions): Promise<void> {
  const sender  = from ?? process.env.EMAIL_FROM ?? FROM_NAME;
  const delays  = [1_000, 2_000];
  let   lastErr: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const { data, error } = await getResend().emails.send({ from: sender, to, subject, html });
      if (error) throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);

      // Log the sent email — fire and forget, never block sending
      void prisma.emailLog.create({
        data: {
          to,
          subject,
          type:     type ?? 'general',
          resendId: data?.id ?? null,
          status:   'sent',
        },
      }).catch(() => {});

      return; // success
    } catch (err) {
      lastErr = err;
      if (isPermanent(err)) {
        console.error('[email] permanent failure — not retrying', { to, subject, err });
        return;
      }
      if (attempt < delays.length) {
        console.warn(`[email] attempt ${attempt + 1} failed — retrying in ${delays[attempt]}ms`, err);
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }

  // All attempts exhausted — log and move on (don't throw; caller shouldn't crash)
  console.error('[email] all retry attempts failed', { to, subject, err: lastErr });
}
