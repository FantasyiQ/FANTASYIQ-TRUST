import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { stripe, planInfo } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import type { SubscriptionTier } from '@prisma/client';

const PLAYER_TIERS = new Set<SubscriptionTier>(['PLAYER_PRO', 'PLAYER_ALL_PRO', 'PLAYER_ELITE']);

// Derive plan type using the tier prefix as the authoritative signal.
// Metadata alone can be missing or wrong; the tier string never lies.
function resolveSubType(
    tier: string | null | undefined,
    metaPlanType: string | null | undefined,
    catalogType: string | null | undefined,
): 'player' | 'commissioner' {
    if (tier?.startsWith('COMMISSIONER_')) return 'commissioner';
    if (tier?.startsWith('PLAYER_'))       return 'player';
    if (metaPlanType === 'commissioner')   return 'commissioner';
    if (catalogType  === 'commissioner')   return 'commissioner';
    return 'player';
}

export async function POST(request: NextRequest): Promise<Response> {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch {
        return Response.json({ error: 'Invalid webhook signature' }, { status: 400 });
    }

    // ── Idempotency: skip already-processed events (Stripe retries / replays) ──
    const alreadyDone = await prisma.processedStripeEvent.findUnique({
        where: { id: event.id },
        select: { id: true },
    });
    if (alreadyDone) {
        return Response.json({ received: true });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const cs = event.data.object as Stripe.Checkout.Session;

                // ── League dues one-time payment ──────────────────────────────────
                if (cs.metadata?.type === 'LEAGUE_DUES') {
                    if (cs.payment_status === 'paid') {
                        const { duesId, memberId, buyInAmount } = cs.metadata;
                        if (duesId && memberId) {
                            const member = await prisma.duesMember.findUnique({
                                where: { id: memberId },
                                select: { duesStatus: true, leagueDuesId: true },
                            });
                            // Idempotent: pay-confirm route may have already written this
                            if (member && member.leagueDuesId === duesId && member.duesStatus !== 'paid') {
                                const amount = parseFloat(buyInAmount ?? '0');
                                await prisma.$transaction([
                                    prisma.duesMember.update({
                                        where: { id: memberId },
                                        data: {
                                            duesStatus:     'paid',
                                            paidAt:         new Date(),
                                            paymentMethod:  'stripe_direct',
                                            stripePaymentId: typeof cs.payment_intent === 'string' ? cs.payment_intent : null,
                                        },
                                    }),
                                    prisma.leagueDues.update({
                                        where: { id: duesId },
                                        data: {
                                            collectedAmount: { increment: amount },
                                            potTotal:        { increment: amount },
                                        },
                                    }),
                                ]);
                            }
                        }
                    }
                    break;
                }
                // ── End league dues ───────────────────────────────────────────────

                const customerId   = cs.customer as string;
                const stripeSubId  = cs.subscription as string | null;
                const metaTier       = cs.metadata?.tier as SubscriptionTier | undefined;
                const metaPlanType   = cs.metadata?.planType ?? 'player';
                const metaSize       = cs.metadata?.leagueSize ? parseInt(cs.metadata.leagueSize) : null;
                const metaLeagueName = cs.metadata?.leagueName ?? null;
                if (!customerId || !stripeSubId) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                // Derive from PLAN_CATALOG if metadata is absent (e.g. manually created subs)
                const tier: SubscriptionTier = metaTier ?? 'FREE';
                const subType  = resolveSubType(tier, metaPlanType, null);
                const leagueSize = metaSize;

                await prisma.$transaction([
                    // Only update user.subscriptionTier for genuine player plans.
                    // Double-guard: subType AND tier must both confirm it's a player plan.
                    ...(subType === 'player' && PLAYER_TIERS.has(tier) ? [
                        prisma.user.update({
                            where: { id: user.id },
                            data: { subscriptionTier: tier },
                        }),
                    ] : []),
                    prisma.subscription.upsert({
                        where: { stripeSubscriptionId: stripeSubId },
                        create: {
                            userId: user.id,
                            stripeSubscriptionId: stripeSubId,
                            stripeCustomerId: customerId,
                            type: subType,
                            leagueSize,
                            leagueName: metaLeagueName,
                            tier,
                            status: 'active',
                        },
                        update: {
                            type: subType,
                            leagueSize,
                            leagueName: metaLeagueName,
                            tier,
                            status: 'active',
                            cancelAtPeriodEnd: false,
                        },
                    }),
                ]);

                // ── Commissioner plan: re-assign matching leagues immediately ─────
                // Leagues synced BEFORE this purchase were assigned to the player plan
                // and consumed slots. Fix that now so slots are freed and the league
                // is correctly covered by the commissioner plan.
                if (subType === 'commissioner' && metaLeagueName) {
                    const dbSub = await prisma.subscription.findUnique({
                        where:  { stripeSubscriptionId: stripeSubId },
                        select: { id: true },
                    });
                    if (dbSub) {
                        await prisma.league.updateMany({
                            where: {
                                userId:           user.id,
                                leagueName:       { equals: metaLeagueName, mode: 'insensitive' },
                                assignedPlanType: { not: 'commissioner' },
                            },
                            data: {
                                assignedPlanId:   dbSub.id,
                                assignedPlanType: 'commissioner',
                            },
                        });
                    }
                }

                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object as Stripe.Subscription;
                const customerId   = sub.customer as string;
                const priceId      = sub.items.data[0]?.price.id;
                const metaPlanType = sub.metadata?.planType;
                const metaSize     = sub.metadata?.leagueSize ? parseInt(sub.metadata.leagueSize) : null;

                if (!customerId) break;

                // Derive tier ONLY from PLAN_CATALOG — never fall back to subscription metadata.
                // metadata.tier reflects the tier at the time of the ORIGINAL checkout, not the
                // current plan. Using it as a fallback would revert the tier after a billing-portal
                // upgrade where the price ID isn't yet in PLAN_CATALOG.
                const info     = priceId ? planInfo(priceId) : null;
                const tier     = info?.tier ?? null;
                const subType  = resolveSubType(tier, metaPlanType, info?.type);
                const leagueSize = info?.leagueSize ?? metaSize ?? null;

                if (!tier) break;  // Price not in catalog — skip; don't revert the stored tier.

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                const item = sub.items.data[0];
                const periodStart = item?.current_period_start
                    ? new Date(item.current_period_start * 1000) : null;
                const periodEnd = item?.current_period_end
                    ? new Date(item.current_period_end * 1000) : null;

                await prisma.$transaction([
                    // Only update user.subscriptionTier for active player plans.
                    // Double-guard: subType AND tier must both confirm it's a player plan.
                    ...(subType === 'player' && PLAYER_TIERS.has(tier as SubscriptionTier) && sub.status === 'active' ? [
                        prisma.user.update({
                            where: { id: user.id },
                            data: { subscriptionTier: tier as SubscriptionTier },
                        }),
                    ] : []),
                    // Reset player tier when player plan is no longer active
                    ...(subType === 'player' && sub.status !== 'active' && sub.status !== 'trialing' ? [
                        prisma.user.update({
                            where: { id: user.id },
                            data: { subscriptionTier: 'FREE' },
                        }),
                    ] : []),
                    prisma.subscription.upsert({
                        where: { stripeSubscriptionId: sub.id },
                        create: {
                            userId: user.id,
                            stripeSubscriptionId: sub.id,
                            stripeCustomerId: customerId,
                            type: subType,
                            leagueSize,
                            tier,
                            status: sub.status,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd: periodEnd,
                            cancelAtPeriodEnd: sub.cancel_at_period_end,
                        },
                        update: {
                            type: subType,
                            leagueSize,
                            tier,
                            status: sub.status,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd: periodEnd,
                            cancelAtPeriodEnd: sub.cancel_at_period_end,
                        },
                    }),
                ]);
                break;
            }

            case 'invoice.created': {
                const invoice = event.data.object as Stripe.Invoice;
                // Only modify invoices that are still in draft — once finalized we can't change description.
                if (invoice.status !== 'draft') break;

                // Resolve the subscription ID from the newer parent-based structure.
                const rawSubRef = invoice.parent?.subscription_details?.subscription;
                const subId = typeof rawSubRef === 'string'
                    ? rawSubRef
                    : (rawSubRef as Stripe.Subscription | undefined)?.id ?? null;
                if (!subId) break;

                // Fetch subscription metadata to get leagueName (set during checkout).
                const subscription = await stripe.subscriptions.retrieve(subId);
                const leagueName = subscription.metadata?.leagueName;
                if (!leagueName) break;

                // Stamp the invoice memo so the league name appears on the receipt PDF.
                const planType = subscription.metadata?.planType ?? 'commissioner';
                const invoiceDescription = planType === 'commissioner'
                    ? `Commissioner Plan — ${leagueName}`
                    : `Player Plan — ${leagueName}`;

                await stripe.invoices.update(invoice.id, { description: invoiceDescription });
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
                if (!customerId) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                // Mark subscription past_due
                const rawSub = invoice.parent?.subscription_details?.subscription;
                const subId  = typeof rawSub === 'string' ? rawSub : (rawSub as Stripe.Subscription | undefined)?.id ?? null;
                if (subId) {
                    await prisma.subscription.updateMany({
                        where: { stripeSubscriptionId: subId, userId: user.id },
                        data:  { status: 'past_due' },
                    });
                }

                // Notify the user
                await prisma.notification.create({
                    data: {
                        userId: user.id,
                        type:   'PLAN_PAYMENT_FAILED',
                        title:  'Payment failed',
                        body:   'We couldn\'t process your subscription payment. Please update your payment method to keep your plan active.',
                        data: {
                            invoiceId:   invoice.id,
                            amountDue:   invoice.amount_due,
                            currency:    invoice.currency,
                            nextAttempt: invoice.next_payment_attempt ?? null,
                        },
                    },
                });
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice    = event.data.object as Stripe.Invoice;
                const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
                // Only notify on subscription renewals, not the initial checkout payment
                // (checkout.session.completed handles that welcome flow)
                if (!customerId || invoice.billing_reason === 'subscription_create') break;

                const user = await prisma.user.findUnique({
                    where:  { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                await notify({
                    userId:     user.id,
                    type:       NotificationType.PLAN_RENEWAL_UPCOMING,
                    title:      'Payment received',
                    body:       `Your subscription payment of ${invoice.amount_paid ? `$${(invoice.amount_paid / 100).toFixed(2)}` : ''} has been processed successfully.`,
                    inApp:      true,
                    email:      false,
                    throttleMs: 0,
                    data: {
                        invoiceId: invoice.id,
                        amount:    invoice.amount_paid ? invoice.amount_paid / 100 : undefined,
                        currency:  invoice.currency,
                    },
                }).catch(err => captureError(err, { event: 'invoice.payment_succeeded', notify: true }));
                break;
            }

            case 'invoice.payment_action_required': {
                const invoice = event.data.object as Stripe.Invoice;
                const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
                if (!customerId) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                await prisma.notification.create({
                    data: {
                        userId: user.id,
                        type:   NotificationType.PLAN_ACTION_REQUIRED,
                        title:  'Action required: complete your payment',
                        body:   'Your bank requires additional verification to process your subscription payment. Please authorize the payment to keep your plan active.',
                        data: {
                            invoiceId: invoice.id,
                            amountDue: invoice.amount_due,
                            currency:  invoice.currency,
                        },
                    },
                });
                break;
            }

            case 'customer.subscription.trial_will_end': {
                const sub = event.data.object as Stripe.Subscription;
                const customerId = sub.customer as string;
                if (!customerId) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
                await notify({
                    userId:     user.id,
                    type:       NotificationType.PLAN_RENEWAL_UPCOMING,
                    title:      'Your free trial ends soon',
                    body:       `Your FiQ trial ${trialEnd ? `ends on ${trialEnd.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}` : 'is ending soon'}. After that, you'll be billed at your plan's regular rate.`,
                    email:      true,
                    inApp:      true,
                    throttleMs: 0,
                    data:       { deadline: trialEnd?.toISOString() },
                }).catch(err => captureError(err, { event: 'customer.subscription.trial_will_end', notify: true }));
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object as Stripe.Subscription;
                const customerId = sub.customer as string;
                if (!customerId) break;

                const user = await prisma.user.findUnique({
                    where: { stripeCustomerId: customerId },
                    select: { id: true },
                });
                if (!user) break;

                // Look up the subscription record to know its type and internal DB ID.
                // assignedPlanId stores our internal DB ID, NOT the Stripe sub ID.
                const subRecord = await prisma.subscription.findUnique({
                    where: { stripeSubscriptionId: sub.id },
                    select: { id: true, type: true },
                });

                // Only update — never create — on deletion. If there's no DB record the
                // subscription was intentionally removed by an admin; recreating it as a
                // canceled ghost would cause it to reappear after every webhook delivery.
                if (!subRecord) break;

                // ── Clear league assignments for the cancelled plan ────────────
                if (subRecord.type === 'commissioner') {
                    // Find the external leagueId(s) covered by this commissioner subscription.
                    // Must use subRecord.id (internal DB id) — sub.id is the Stripe sub id and never matches.
                    const coveredLeagues = await prisma.league.findMany({
                        where: { assignedPlanId: subRecord.id },
                        select: { leagueId: true },  // external platform ID (e.g. Sleeper league ID)
                    });
                    const externalIds = coveredLeagues.map(l => l.leagueId);

                    // Clear commissioner's own rows AND all member rows for those leagues.
                    // Member rows have assignedPlanType='commissioner' but assignedPlanId=null,
                    // so we match by external leagueId + planType rather than planId.
                    if (externalIds.length > 0) {
                        await prisma.league.updateMany({
                            where: {
                                leagueId:         { in: externalIds },
                                assignedPlanType: 'commissioner',
                            },
                            data: {
                                assignedPlanId:   null,
                                assignedPlanType: null,
                            },
                        });
                    }
                } else {
                    // Player plan cancelled — unassign any leagues tied to this subscription.
                    // Must use subRecord.id (internal DB id) — sub.id is the Stripe sub id and never matches.
                    await prisma.league.updateMany({
                        where: { assignedPlanId: subRecord.id },
                        data:  { assignedPlanId: null, assignedPlanType: null },
                    });
                }

                await prisma.$transaction([
                    // Only reset subscriptionTier for player plan cancellations
                    ...(subRecord.type === 'player' ? [
                        prisma.user.update({
                            where: { id: user.id },
                            data: { subscriptionTier: 'FREE' },
                        }),
                    ] : []),
                    prisma.subscription.updateMany({
                        where: { stripeSubscriptionId: sub.id },
                        data: {
                            status: 'canceled',
                            cancelAtPeriodEnd: false,
                        },
                    }),
                ]);

                // Send cancellation confirmation (non-blocking)
                notify({
                    userId:  user.id,
                    type:    NotificationType.PLAN_CANCELLED,
                    title:   'Your subscription has been cancelled',
                    body:    'Your FiQ subscription has been cancelled. You\'ll retain access until the end of your billing period.',
                    email:   true,
                    inApp:   true,
                    throttleMs: 0,
                }).catch(err => captureError(err, { event: 'customer.subscription.deleted', notify: true }));
                break;
            }
        }
    } catch (err) {
        captureError(err, { event: event.type });
        return Response.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    // Mark event as processed — log failures so re-processing can be investigated
    prisma.processedStripeEvent.create({ data: { id: event.id } })
        .catch(err => captureError(err, { event: event.id, context: 'idempotency_write' }));

    return Response.json({ received: true });
}
