import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PricingClient from './PricingClient';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
    const session = await auth();

    let activeSub: { tier: string; stripeSubscriptionId: string } | null = null;

    if (session?.user?.email) {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                // subscriptionTier on the User row is the authoritative source —
                // the upgrade API updates this directly and it's what the navbar uses
                subscriptionTier: true,
                subscription: {
                    select: { status: true, stripeSubscriptionId: true },
                },
            },
        });

        const sub = user?.subscription;
        if (
            user &&
            sub?.stripeSubscriptionId &&
            (sub.status === 'active' || sub.status === 'trialing')
        ) {
            activeSub = {
                tier: user.subscriptionTier,   // User table, not Subscription table
                stripeSubscriptionId: sub.stripeSubscriptionId,
            };
        }
    }

    return <PricingClient activeSub={activeSub} />;
}
