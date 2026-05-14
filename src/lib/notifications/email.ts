import { Resend } from 'resend';

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
}

export async function sendEmail({ to, subject, html, from }: EmailOptions) {
  const sender = from ?? process.env.EMAIL_FROM ?? 'FantasyIQ <noreply@fantasyiq.app>';
  return getResend().emails.send({ from: sender, to, subject, html });
}
