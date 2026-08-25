import { prisma } from '@/lib/prisma';

// Real containment, not an allowlist: manual (Venmo/cash) dues trackers carry
// no Stripe/pooled-balance risk at all, so they're open to every commissioner.
// Stripe-backed trackers require the commissioner to have completed Stripe
// Connect onboarding first — dues then route directly into their own
// account (see commissioner-onboard route), never FiQ's platform balance.
export async function canCreateDuesTracker(
    email: string | null | undefined,
    paymentModel: 'stripe' | 'manual' = 'manual',
): Promise<boolean> {
    if (!email) return false;
    if (paymentModel === 'manual') return true;

    const user = await prisma.user.findUnique({
        where:  { email },
        select: { stripeConnectAccountId: true },
    });
    return !!user?.stripeConnectAccountId;
}
