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
                subscription: {
                    select: { status: true, tier: true, stripeSubscriptionId: true },
                },
            },
        });

        const sub = user?.subscription;
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
