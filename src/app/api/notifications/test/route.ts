import { auth } from '@/lib/auth';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';

const TEST_TYPES = [
  { type: NotificationType.DUES_PAYMENT_CONFIRMED,  title: 'Test: Payment Confirmed',     body: 'Your dues payment of $100 has been confirmed. ✓' },
  { type: NotificationType.DUES_REMINDER_DAILY,     title: 'Test: Dues Reminder',          body: 'Your dues of $100 for Test League are due in 3 days.' },
  { type: NotificationType.MEMBER_JOINED_LEAGUE,    title: 'Test: Member Joined',          body: 'John Doe just joined your league on FantasyiQ Trust.' },
  { type: NotificationType.PAYOUTS_RELEASED,        title: 'Test: Payouts Released',       body: 'Your commissioner has finalized the season payouts.' },
  { type: NotificationType.COMMISSIONER_SYNC_FAILED,title: 'Test: Sync Failed',            body: 'Sleeper sync encountered an error. Check your league settings.' },
  { type: NotificationType.SEASON_DRAFT_REMINDER,   title: 'Test: Draft Tomorrow',         body: 'Your league draft starts in 24 hours. Make sure your queue is set.' },
  { type: NotificationType.LEAGUE_DIGEST_WEEKLY,    title: 'Test: Weekly Digest',          body: 'Standings updated · 3 trades this week · 8 of 12 dues paid.' },
  { type: NotificationType.PLAN_RENEWAL_UPCOMING,   title: 'Test: Plan Renewal',           body: 'Your Commissioner Pro plan renews in 7 days.' },
] as const;

// POST /api/notifications/test
// Body: { typeIndex?: number } — fires one of the test notifications for the current user.
export async function POST(req: Request): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as { typeIndex?: number };
    const idx  = typeof body.typeIndex === 'number'
        ? Math.min(Math.max(0, body.typeIndex), TEST_TYPES.length - 1)
        : Math.floor(Math.random() * TEST_TYPES.length);

    const { type, title, body: notifBody } = TEST_TYPES[idx];

    await notify({
        userId:    session.user.id,
        type,
        title,
        body:      notifBody,
        data:      { leagueId: 'test', leagueName: 'Test League', duesId: 'test', amount: 100 },
        email:     false,     // never send real emails from test
        throttleMs: 0,        // bypass throttle for tests
    });

    return Response.json({ ok: true, type, title });
}

// GET — return list of available test types
export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ types: TEST_TYPES.map((t, i) => ({ index: i, type: t.type, title: t.title })) });
}
