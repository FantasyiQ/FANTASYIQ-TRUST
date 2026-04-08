import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PricingClient from './PricingClient';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
    const session = await auth();

    let activeSub: { tier: string; stripeSubscriptionId: string } | null = null;

    if (session?.user?.id) {
        const sub = await prisma.subscription.findUnique({
            where: { userId: session.user.id },
            select: { status: true, tier: true, stripeSubscriptionId: true },
        });

        if (
            sub?.stripeSubscriptionId &&
            (sub.status === 'active' || sub.status === 'trialing')
        ) {
            activeSub = {
                tier: sub.tier,
                stripeSubscriptionId: sub.stripeSubscriptionId,
            };
        }
    }

    return <PricingClient activeSub={activeSub} />;
}
