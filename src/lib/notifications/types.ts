export const NotificationType = {
  // Dues reminders
  DUES_REMINDER_WEEKLY:         'dues.reminder.weekly',
  DUES_REMINDER_THREE_PER_WEEK: 'dues.reminder.three_per_week',
  DUES_REMINDER_DAILY:          'dues.reminder.daily',
  DUES_REMINDER_FINAL_HOURS:    'dues.reminder.final_hours',

  // Payment events
  DUES_PAYMENT_CONFIRMED:       'dues.payment.confirmed',
  DUES_PAYMENT_MANUAL:          'dues.payment.manual_recorded',
  DUES_PAYMENT_REMOVED:         'dues.payment.removed',
  DUES_UPDATED:                 'dues.updated',

  // Member & account
  MEMBER_JOINED_LEAGUE:         'member.joined_league',
  MEMBER_LINKED_DUES_SLOT:      'member.linked_to_dues_slot',
  MEMBER_NOT_ENROLLED:          'member.not_enrolled_warning',

  // Payouts
  PAYOUTS_RELEASED:             'payouts.released',
  PAYOUT_FAILED:                'payout.failed',

  // Commissioner alerts
  COMMISSIONER_SYNC_FAILED:     'commissioner.alert.sync_failed',
  COMMISSIONER_PAYOUT_MISSING:  'commissioner.alert.payout_account_missing',
  COMMISSIONER_UNPAID_DIGEST:   'commissioner.alert.unpaid_members_digest',

  // League activity
  LEAGUE_DIGEST_WEEKLY:         'league.digest.weekly',

  // Season milestones
  SEASON_DRAFT_REMINDER:        'season.draft_reminder',
  SEASON_PLAYOFFS_RELEASED:     'season.playoffs_released',
  SEASON_CHAMPIONSHIP_WEEK:     'season.championship_week',
  SEASON_FINAL_RECAP:           'season.final_recap',

  // Plan & account
  PLAN_LIMIT_REACHED:           'plan.limit_reached',
  PLAN_RENEWAL_UPCOMING:        'plan.renewal_upcoming',
  PLAN_PAYMENT_FAILED:          'plan.payment_failed',
  PLAN_ACTION_REQUIRED:         'plan.action_required',
  PLAN_CANCELLED:               'plan.cancelled',

  // Onboarding
  ACCOUNT_WELCOME:              'account.welcome',
  ACCOUNT_PASSWORD_RESET:       'account.password_reset',
  ACCOUNT_EMAIL_VERIFICATION:   'account.email_verification',

  // Invite
  INVITE_PROGRESS:              'invite.progress',
  INVITE_REMINDER:              'invite.reminder',

  // Identity
  IDENTITY_NEEDS_CONFIRMATION:  'identity.needs_confirmation',

  // ── Phase 3 Automation & Intelligence Layer ───────────────────────────────

  // Engine 1 — Sync Failure Auto-Recovery
  SYNC_FAILURE:                 'sync_failure',

  // Engine 2 — Commissioner Activation
  COMMISSIONER_NUDGE:           'commissioner_nudge',

  // Engine 3 — Churn Prevention
  CHURN_NUDGE:                  'churn_nudge',

  // Engine 4 — Upsell & Expansion
  UPSELL_PROMPT:                'upsell_prompt',

  // Engine 5 — League Health
  LEAGUE_HEALTH:                'league_health',

  // Engine 6 — Feature Intelligence
  FEATURE_SUGGESTION:           'feature_suggestion',

  // Engine 8 — Automated Messaging (new triggers)
  LEAGUE_SYNC_REMINDER:         'league.sync.reminder',      // "sync now to keep PRS fresh"

  // League Finder
  LF_JOIN_REQUEST:              'lf.join_request',           // player requested to join commissioner's league
  LF_PRS_HISTORY_ADDED:         'lf.prs_history_added',      // commissioner imported history for this player

  // Platform ops (admin-only)
  PLATFORM_BALANCE_LOW:         'platform.balance_low',
} as const;

export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

// ── Per-type throttle windows ────────────────────────────────────────────────
// undefined = no throttle (send every time)
const DAY  = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export const THROTTLE_MS: Partial<Record<NotificationType, number>> = {
  // Dues reminders — tiered by urgency
  [NotificationType.DUES_REMINDER_WEEKLY]:          WEEK,
  [NotificationType.DUES_REMINDER_THREE_PER_WEEK]:  2 * DAY,
  [NotificationType.DUES_REMINDER_DAILY]:           23 * 60 * 60 * 1000,   // 23h
  [NotificationType.DUES_REMINDER_FINAL_HOURS]:     5  * 60 * 60 * 1000,   // 5h

  // Digests — weekly cadence
  [NotificationType.COMMISSIONER_UNPAID_DIGEST]:    6 * DAY,
  [NotificationType.LEAGUE_DIGEST_WEEKLY]:          6 * DAY,

  // Commissioner alerts — daily max
  [NotificationType.COMMISSIONER_SYNC_FAILED]:      DAY,
  [NotificationType.COMMISSIONER_PAYOUT_MISSING]:   WEEK,

  // Identity — once per conflict (30 days)
  [NotificationType.IDENTITY_NEEDS_CONFIRMATION]:   30 * DAY,

  // Plan — once per week
  [NotificationType.PLAN_RENEWAL_UPCOMING]:         WEEK,
  [NotificationType.PLAN_LIMIT_REACHED]:            DAY,

  // Invite reminder — daily max per send
  [NotificationType.INVITE_REMINDER]:               DAY,

  // Season milestones — once each (7 days prevents double-fire)
  [NotificationType.SEASON_DRAFT_REMINDER]:         7 * DAY,
  [NotificationType.SEASON_PLAYOFFS_RELEASED]:      7 * DAY,
  [NotificationType.SEASON_CHAMPIONSHIP_WEEK]:      7 * DAY,
  [NotificationType.SEASON_FINAL_RECAP]:            7 * DAY,

  // Phase 3 engines — reasonable cooldowns to avoid spam
  [NotificationType.SYNC_FAILURE]:                  DAY,
  [NotificationType.COMMISSIONER_NUDGE]:            7 * DAY,
  [NotificationType.CHURN_NUDGE]:                   3 * DAY,
  [NotificationType.UPSELL_PROMPT]:                 7 * DAY,
  [NotificationType.LEAGUE_HEALTH]:                 7 * DAY,
  [NotificationType.FEATURE_SUGGESTION]:            14 * DAY,
  [NotificationType.LEAGUE_SYNC_REMINDER]:          7 * DAY,

  // Platform ops — daily max so persistent low balance doesn't spam
  [NotificationType.PLATFORM_BALANCE_LOW]:            DAY,

  // No throttle (undefined): dues.payment.confirmed, dues.payment.manual_recorded,
  // member.joined_league, member.linked_to_dues_slot, payouts.released,
  // payout.failed, dues.updated, plan.payment_failed, invite.progress
};

export interface NotificationPayload {
  leagueId?:       string;
  leagueName?:     string;
  duesId?:         string;
  amount?:         number;
  payer?:          string;
  deadline?:       string;  // ISO string
  memberId?:       string;
  memberName?:     string;
  unreadCount?:    number;
  unpaidNames?:    string[];
  payoutItems?:    { rank: number; amount: number; teamName: string }[];
  teamOptions?:    { id: string; displayName: string }[];
  [key: string]:   unknown;
}
