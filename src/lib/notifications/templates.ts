import type { NotificationType, NotificationPayload } from './types';

const appUrl = process.env.NEXTAUTH_URL ?? 'https://fantasyiq.app';

interface TemplateContext {
  title: string;
  body:  string;
  data?: NotificationPayload;
}

function baseLayout(title: string, bodyHtml: string, ctaHtml?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <!-- Header bar -->
          <tr>
            <td style="background-color:#D4AF37;padding:16px 32px;border-radius:12px 12px 0 0;">
              <span style="color:#0a0a0a;font-size:18px;font-weight:700;letter-spacing:-0.5px;">
                FantasyiQ Trust
              </span>
            </td>
          </tr>
          <!-- Card body -->
          <tr>
            <td style="background-color:#111111;border:1px solid #1f1f1f;border-top:none;padding:32px;border-radius:0 0 12px 12px;">
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.3;">${escapeHtml(title)}</h1>
              <div style="color:#a1a1aa;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </div>
              ${ctaHtml ?? ''}
              <hr style="border:none;border-top:1px solid #1f1f1f;margin:28px 0 20px;" />
              <p style="color:#52525b;font-size:12px;margin:0;line-height:1.5;">
                You received this email because you have an account on FantasyiQ Trust.<br />
                To manage your notification preferences, visit your
                <a href="${appUrl}/dashboard/notifications" style="color:#D4AF37;text-decoration:none;">notification settings</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `<div style="margin:24px 0 8px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background-color:#D4AF37;color:#0a0a0a;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;">${escapeHtml(label)}</a>
  </div>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt$(n?: number): string {
  if (n == null) return '';
  return `$${n.toFixed(2).replace(/\.00$/, '')}`;
}

export function renderTemplate(type: NotificationType | string, ctx: TemplateContext): string {
  const { title, body, data } = ctx;
  const leagueHref = data?.leagueId ? `${appUrl}/dashboard/league/${data.leagueId}` : `${appUrl}/dashboard`;

  switch (type) {
    // ── Payment confirmed (Stripe) ──────────────────────────────────────────
    case 'dues.payment.confirmed': {
      const amount = data?.amount ? fmt$(data.amount) : '';
      const league = data?.leagueName ? ` for <strong style="color:#fff;">${escapeHtml(data.leagueName)}</strong>` : '';
      const bodyHtml = `<p style="margin:0 0 8px;">Your dues payment${amount ? ` of <strong style="color:#fff;">${amount}</strong>` : ''}${league} has been confirmed. You&#39;re all set!</p>`;
      return baseLayout(title, bodyHtml, ctaButton('View League', leagueHref));
    }

    // ── Manual payment recorded ──────────────────────────────────────────────
    case 'dues.payment.manual_recorded': {
      const amount = data?.amount ? fmt$(data.amount) : '';
      const bodyHtml = `<p style="margin:0 0 8px;">Your commissioner has manually recorded your payment${amount ? ` of <strong style="color:#fff;">${amount}</strong>` : ''}. Your dues are now marked as paid.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('View League', leagueHref));
    }

    // ── Dues reminders ───────────────────────────────────────────────────────
    case 'dues.reminder.weekly':
    case 'dues.reminder.three_per_week':
    case 'dues.reminder.daily':
    case 'dues.reminder.final_hours': {
      const amount   = data?.amount   ? fmt$(data.amount)   : '';
      const league   = data?.leagueName ?? '';
      const deadline = data?.deadline  ? new Date(data.deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
      const payHref  = data?.leagueId && data?.duesId
        ? `${appUrl}/dashboard/league/${data.leagueId}/dues/pay`
        : leagueHref;
      const urgency = type === 'dues.reminder.final_hours'
        ? '<p style="margin:0 0 12px;color:#ef4444;font-weight:600;">⚠️ Your dues are due very soon!</p>'
        : '';
      const bodyHtml = `${urgency}<p style="margin:0 0 8px;">Your league dues${amount ? ` of <strong style="color:#fff;">${amount}</strong>` : ''}${league ? ` for <strong style="color:#fff;">${escapeHtml(league)}</strong>` : ''} ${deadline ? `are due <strong style="color:#fff;">${escapeHtml(deadline)}</strong>` : 'are due soon'}.  Please pay before the deadline to stay in good standing.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Pay Now', payHref));
    }

    // ── Dues updated ─────────────────────────────────────────────────────────
    case 'dues.updated': {
      const bodyHtml = `<p style="margin:0 0 8px;">Your commissioner has updated the dues details for ${data?.leagueName ? `<strong style="color:#fff;">${escapeHtml(data.leagueName)}</strong>` : 'your league'}. Please review the latest information.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('View Dues', leagueHref));
    }

    // ── Member joined league ─────────────────────────────────────────────────
    case 'member.joined_league': {
      const memberName = data?.memberName ?? 'A new member';
      const bodyHtml = `<p style="margin:0 0 8px;"><strong style="color:#fff;">${escapeHtml(memberName)}</strong> has joined your league${data?.leagueName ? ` <strong style="color:#fff;">${escapeHtml(data.leagueName)}</strong>` : ''} on FantasyiQ Trust.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('View League', leagueHref));
    }

    // ── Payouts released ─────────────────────────────────────────────────────
    case 'payouts.released': {
      const bodyHtml = `<p style="margin:0 0 8px;">Your commissioner has completed and released payouts for ${data?.leagueName ? `<strong style="color:#fff;">${escapeHtml(data.leagueName)}</strong>` : 'your league'}. Check your winnings!</p>`;
      return baseLayout(title, bodyHtml, ctaButton('View Payouts', `${leagueHref}#payouts`));
    }

    // ── Commissioner unpaid digest ────────────────────────────────────────────
    case 'commissioner.alert.unpaid_members_digest': {
      const names = data?.unpaidNames ?? [];
      const listHtml = names.length > 0
        ? `<ul style="margin:12px 0;padding-left:20px;">${names.map(n => `<li style="margin-bottom:4px;color:#a1a1aa;">${escapeHtml(n)}</li>`).join('')}</ul>`
        : '';
      const bodyHtml = `<p style="margin:0 0 8px;">The following <strong style="color:#fff;">${names.length} member${names.length !== 1 ? 's' : ''}</strong>${data?.leagueName ? ` in <strong style="color:#fff;">${escapeHtml(data.leagueName)}</strong>` : ''} still haven&#39;t paid their dues:</p>${listHtml}`;
      return baseLayout(title, bodyHtml, ctaButton('View Dues Manager', leagueHref));
    }

    // ── Weekly league digest ─────────────────────────────────────────────────
    case 'league.digest.weekly': {
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>`;
      return baseLayout(title, bodyHtml, ctaButton('View League', leagueHref));
    }

    // ── Plan renewal upcoming ─────────────────────────────────────────────────
    case 'plan.renewal_upcoming': {
      const renewDate = data?.deadline ? new Date(data.deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'soon';
      const bodyHtml = `<p style="margin:0 0 8px;">Your FiQ subscription renews on <strong style="color:#fff;">${escapeHtml(renewDate)}</strong>. No action needed — you&#39;ll continue to have full access.</p>
      <p style="margin:8px 0 0;color:#71717a;">If you&#39;d like to update your plan or cancel, visit your account settings before the renewal date.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Manage Subscription', `${appUrl}/dashboard/account`));
    }

    // ── Sync failure ──────────────────────────────────────────────────────────
    case 'sync_failure': {
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>
      <p style="margin:8px 0 0;color:#71717a;">Head to your dashboard and update your credentials to resume syncing.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Go to Dashboard', `${appUrl}/dashboard`));
    }

    // ── Commissioner activation nudge ─────────────────────────────────────────
    case 'commissioner_nudge': {
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Continue Setup', `${appUrl}/dashboard/commissioner`));
    }

    // ── Churn nudge ───────────────────────────────────────────────────────────
    case 'churn_nudge': {
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Go to Dashboard', `${appUrl}/dashboard`));
    }

    // ── Upsell prompt ─────────────────────────────────────────────────────────
    case 'upsell_prompt': {
      const href = (data as Record<string, string> | undefined)?.href ?? `${appUrl}/pricing`;
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>`;
      return baseLayout(title, bodyHtml, ctaButton('See Plans', `${appUrl}${href.startsWith('/') ? href : '/pricing'}`));
    }

    // ── League health alert ───────────────────────────────────────────────────
    case 'league_health': {
      const lid = (data as Record<string, string> | undefined)?.leagueId;
      const href = lid ? `${appUrl}/dashboard/commissioner` : `${appUrl}/dashboard/commissioner`;
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Fix Now', href));
    }

    // ── Feature suggestion ────────────────────────────────────────────────────
    case 'feature_suggestion': {
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Try It Now', `${appUrl}/dashboard`));
    }

    // ── Sync reminder (PRS staleness) ─────────────────────────────────────────
    case 'league.sync.reminder': {
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>
      <p style="margin:8px 0 0;color:#71717a;">Your Player Reliability Score and power rankings update automatically when your league syncs.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Sync Now', `${appUrl}/dashboard`));
    }

    // ── Welcome ───────────────────────────────────────────────────────────────
    case 'account.welcome': {
      const bodyHtml = `<p style="margin:0 0 12px;">Welcome to <strong style="color:#fff;">FantasyiQ Trust</strong> — your league&#39;s financial command center.</p>
      <p style="margin:0 0 8px;">Here&#39;s how to get started:</p>
      <ol style="margin:12px 0;padding-left:20px;">
        <li style="margin-bottom:6px;">Sync your Sleeper, ESPN, or Yahoo league</li>
        <li style="margin-bottom:6px;">Set up dues tracking for your league</li>
        <li style="margin-bottom:6px;">Invite your league members</li>
      </ol>
      <p style="margin:8px 0 0;color:#71717a;">Need help? Check out the dashboard to get started in minutes.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Go to Dashboard', `${appUrl}/dashboard`));
    }

    // ── Payment failed ────────────────────────────────────────────────────────
    case 'plan.payment_failed': {
      const bodyHtml = `<p style="margin:0 0 12px;">${escapeHtml(body)}</p>
      <p style="margin:0 0 8px;color:#71717a;">To keep your plan active, please update your payment method before your next retry.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Update Payment Method', `${appUrl}/dashboard/plan/player`));
    }

    // ── Payment action required (3D Secure / SCA) ────────────────────────────
    case 'plan.action_required': {
      const bodyHtml = `<p style="margin:0 0 12px;">${escapeHtml(body)}</p>
      <p style="margin:0 0 8px;color:#71717a;">Your bank requires additional verification to process your payment. Click below to complete the authorization — it only takes a moment.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Authorize Payment', `${appUrl}/dashboard/plan/player`));
    }

    // ── Plan cancelled ────────────────────────────────────────────────────────
    case 'plan.cancelled': {
      const bodyHtml = `<p style="margin:0 0 12px;">Your FiQ subscription has been cancelled. You&#39;ll retain access until the end of your current billing period.</p>
      <p style="margin:0 0 8px;color:#71717a;">Changed your mind? You can re-subscribe any time from the pricing page.</p>
      <p style="margin:16px 0 0;color:#52525b;font-size:13px;">Per our <a href="${appUrl}/terms" style="color:#71717a;text-decoration:underline;">Terms of Service</a>, subscription fees are non-refundable. Access continues through the end of your paid period.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('See Plans', `${appUrl}/pricing`));
    }

    // ── Password reset ────────────────────────────────────────────────────────
    case 'account.password_reset': {
      const resetUrl = data?.resetUrl as string ?? `${appUrl}/reset-password`;
      const bodyHtml = `<p style="margin:0 0 12px;">We received a request to reset the password for your FantasyiQ Trust account.</p>
      <p style="margin:0 0 8px;">Click the button below to choose a new password. This link expires in <strong style="color:#fff;">1 hour</strong>.</p>
      <p style="margin:16px 0 0;color:#52525b;font-size:13px;">If you didn&#39;t request a password reset, you can safely ignore this email. Your password will not be changed.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Reset Password', resetUrl));
    }

    // ── Email verification ────────────────────────────────────────────────────
    case 'account.email_verification': {
      const verifyUrl = data?.verifyUrl as string ?? `${appUrl}/dashboard`;
      const bodyHtml = `<p style="margin:0 0 12px;">Thanks for signing up for <strong style="color:#fff;">FantasyiQ Trust</strong>.</p>
      <p style="margin:0 0 8px;">Please verify your email address to confirm your account. This link expires in <strong style="color:#fff;">24 hours</strong>.</p>
      <p style="margin:16px 0 0;color:#52525b;font-size:13px;">If you didn&#39;t create a FantasyiQ Trust account, you can safely ignore this email.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Verify Email', verifyUrl));
    }

    // ── League Finder: join request ──────────────────────────────────────────
    case 'lf.join_request': {
      const name      = data?.memberName as string | undefined;
      const lfLeagueId = data?.leagueId as string | undefined;
      const manageHref = lfLeagueId
          ? `${appUrl}/leaguefinder/leagues/${lfLeagueId}/manage`
          : `${appUrl}/leaguefinder`;
      const bodyHtml = `<p style="margin:0 0 12px;">${escapeHtml(name ?? 'Someone')} has requested to join your league.</p>
      <p style="margin:0 0 8px;">Review their player profile and intro message, then approve or decline the request.</p>`;
      return baseLayout(title, bodyHtml, ctaButton('View Waitlist', manageHref));
    }

    // ── Generic fallback ─────────────────────────────────────────────────────
    default: {
      const bodyHtml = `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>`;
      return baseLayout(title, bodyHtml, ctaButton('Go to FantasyiQ Trust', `${appUrl}/dashboard`));
    }
  }
}
