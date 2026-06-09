import { auth } from '@/lib/auth';
import { reconcileStripeSubscriptions } from '@/lib/stripe-reconcile';

// POST /api/user/sync-subscription
// Reconciles the caller's Stripe subscriptions with the DB.
// Safe to call repeatedly — all upserts are idempotent.
// Use when a user reports missing access after a successful purchase.
export async function POST(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const synced = await reconcileStripeSubscriptions(session.user.id);
        return Response.json({ ok: true, synced });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
