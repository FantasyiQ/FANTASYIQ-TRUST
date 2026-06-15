import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { reconcileStripeSubscriptions } from '@/lib/stripe-reconcile';
import ManageBillingButton from './ManageBillingButton';
import type Stripe from 'stripe';

function formatTier(tier: string): string {
    switch (tier) {
        case 'PLAYER_PRO':           return 'Player Pro';
        case 'PLAYER_ALL_PRO':       return 'Player All-Pro';
        case 'PLAYER_ELITE':         return 'Player Elite';
        case 'COMMISSIONER_PRO':     return 'Commissioner Pro';
        case 'COMMISSIONER_ALL_PRO': return 'Commissioner All-Pro';
        case 'COMMISSIONER_ELITE':   return 'Commissioner Elite';
        default:                     return tier;
    }
}

function formatCurrency(amount: number | null, currency: string): string {
    if (amount === null) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
    }).format(amount / 100);
}

function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

const STATUS_STYLES: Record<string, string> = {
    paid:           'bg-green-900/40 text-green-400 border-green-800',
    open:           'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    void:           'bg-gray-800 text-gray-500 border-gray-700',
    uncollectible:  'bg-red-900/40 text-red-400 border-red-800',
    draft:          'bg-gray-800 text-gray-500 border-gray-700',
};

interface SubWithInvoices {
    id: string;
    type: string;
    tier: string;
    status: string;
    leagueName: string | null;
    leagueSize: number | null;
    stripeSubscriptionId: string | null;
    invoices: Stripe.Invoice[];
}

export default async function BillingHistoryPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    // Belt-and-suspenders: if checkout.session.completed webhook failed, upsert
    // any active Stripe subscriptions that are missing from the DB before rendering.
    await reconcileStripeSubscriptions(session.user.id).catch(() => {});

    const subscriptions = await prisma.subscription.findMany({
        where: {
            userId: session.user.id,
            tier: { not: 'FREE' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            type: true,
            tier: true,
            status: true,
            leagueName: true,
            leagueSize: true,
            stripeSubscriptionId: true,
        },
    });

    // Fetch invoices for each subscription in parallel
    const subsWithInvoices: SubWithInvoices[] = await Promise.all(
        subscriptions.map(async (sub) => {
            if (!sub.stripeSubscriptionId) {
                return { ...sub, tier: sub.tier as string, invoices: [] };
            }
            try {
                const result = await stripe.invoices.list({
                    subscription: sub.stripeSubscriptionId,
                    limit: 100,
                });
                return { ...sub, tier: sub.tier as string, invoices: result.data };
            } catch {
                return { ...sub, tier: sub.tier as string, invoices: [] };
            }
        })
    );

    const hasAnyInvoices = subsWithInvoices.some(s => s.invoices.length > 0);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                            ← Back to My Leagues
                        </Link>
                        <h1 className="text-2xl font-bold mt-3">Billing History</h1>
                        <p className="text-gray-400 text-sm mt-1">
                            All receipts and invoices across your plans.
                        </p>
                    </div>
                    <ManageBillingButton />
                </div>

                {subscriptions.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                        <p className="text-gray-400">No active plans found.</p>
                        <Link href="/pricing" className="mt-4 inline-block text-[#D4AF37] text-sm hover:underline">
                            Browse Plans →
                        </Link>
                    </div>
                ) : !hasAnyInvoices ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                        <p className="text-gray-400">No billing history yet.</p>
                        <p className="text-gray-500 text-sm mt-1">Your receipts will appear here after your first charge.</p>
                    </div>
                ) : (
                    subsWithInvoices
                        .filter(sub => sub.invoices.length > 0)
                        .map(sub => (
                            <section key={sub.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

                                {/* Subscription header */}
                                <div className="px-6 py-4 border-b border-gray-800 flex items-start justify-between gap-4 flex-wrap">
                                    <div>
                                        <p className="font-semibold text-white">
                                            {formatTier(sub.tier)}
                                            {sub.leagueSize ? ` — ${sub.leagueSize}-Team` : ''}
                                        </p>
                                        {sub.type === 'commissioner' && sub.leagueName && (
                                            <p className="text-[#D4AF37] text-sm mt-0.5 font-medium">{sub.leagueName}</p>
                                        )}
                                        {sub.type === 'player' && (
                                            <p className="text-gray-500 text-sm mt-0.5">Player Plan</p>
                                        )}
                                    </div>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border self-start ${
                                        sub.status === 'active'   ? 'bg-green-900/40 text-green-400 border-green-800'  :
                                        sub.status === 'canceled' ? 'bg-red-900/40 text-red-400 border-red-800'        :
                                        'bg-gray-800 text-gray-500 border-gray-700'
                                    }`}>
                                        {sub.status.replace('_', ' ')}
                                    </span>
                                </div>

                                {/* Invoice rows */}
                                <div className="divide-y divide-gray-800">
                                    {sub.invoices.map(inv => (
                                        <div key={inv.id} className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-white">
                                                        {inv.created ? formatDate(inv.created) : '—'}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                                                        {inv.number ?? inv.id}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 flex-shrink-0">
                                                <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                                    STATUS_STYLES[inv.status ?? 'draft'] ?? STATUS_STYLES.draft
                                                }`}>
                                                    {inv.status ?? 'draft'}
                                                </span>

                                                <span className="text-sm font-semibold text-white w-20 text-right">
                                                    {formatCurrency(inv.amount_paid ?? inv.amount_due, inv.currency)}
                                                </span>

                                                {(inv.invoice_pdf || inv.hosted_invoice_url) ? (
                                                    <a
                                                        href={(inv.invoice_pdf ?? inv.hosted_invoice_url)!}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[#D4AF37]/70 hover:text-[#D4AF37] text-sm font-medium transition whitespace-nowrap"
                                                    >
                                                        Receipt ↗
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-600 text-sm w-16">—</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))
                )}

                {/* Footer note */}
                {hasAnyInvoices && (
                    <p className="text-center text-gray-600 text-xs">
                        Need help with a charge?{' '}
                        <a href="mailto:support@fantasyiqtrust.com" className="text-gray-500 hover:text-gray-300 transition">
                            Contact support
                        </a>
                    </p>
                )}
            </div>
        </main>
    );
}
