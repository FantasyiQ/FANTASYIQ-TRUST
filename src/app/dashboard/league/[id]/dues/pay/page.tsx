export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getLeagueById } from '@/lib/db/leagues';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

function appUrl() {
    return process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

export default async function PayDuesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const user   = await getCurrentUser();
    const league = await getLeagueById(id, user.id);
    if (!league) redirect('/dashboard');

    const dues = await prisma.leagueDues.findFirst({
        where:  { leagueName: { equals: league.leagueName, mode: 'insensitive' }, season: league.season },
        select: { id: true, buyInAmount: true, commissionerId: true },
    });

    if (!dues) {
        return (
            <div className="max-w-xl mx-auto mt-10 space-y-4">
                <p className="text-gray-400">No dues have been set for this league yet.</p>
                <Link href={`/dashboard/league/${id}/overview`} className="text-sm text-gray-500 hover:text-gray-300 transition">
                    ← Back to Overview
                </Link>
            </div>
        );
    }

    // Commissioners use Record Cash Received — send them to the dues manager instead
    if (dues.commissionerId === user.id) {
        redirect(`/dashboard/commissioner/dues/${dues.id}`);
    }

    const member = await prisma.duesMember.findFirst({
        where:  { leagueDuesId: dues.id, userId: user.id },
        select: { id: true, duesStatus: true, displayName: true },
    });

    if (member?.duesStatus === 'paid') {
        return (
            <div className="max-w-xl mx-auto mt-10 space-y-6">
                <nav className="flex items-center gap-2 text-sm text-gray-500">
                    <Link href={`/dashboard/league/${id}/overview`} className="hover:text-gray-300 transition">
                        {league.leagueName.replace(/\s*\(\d{4}\)\s*$/, '')} ({league.season})
                    </Link>
                    <span>→</span>
                    <span className="text-white">Pay Dues</span>
                </nav>
                <p className="text-green-400 font-medium">You have already paid your dues for this season.</p>
                <Link href={`/dashboard/league/${id}/overview`} className="text-sm text-gray-500 hover:text-gray-300 transition">
                    ← Back to Overview
                </Link>
            </div>
        );
    }

    if (!member) {
        return (
            <div className="max-w-xl mx-auto mt-10 space-y-4">
                <p className="text-gray-400">
                    Your account isn&apos;t linked to a member slot in this league yet. Ask your commissioner to assign you.
                </p>
                <Link href={`/dashboard/league/${id}/overview`} className="text-sm text-gray-500 hover:text-gray-300 transition">
                    ← Back to Overview
                </Link>
            </div>
        );
    }

    // Get or create Stripe customer
    const dbUser = await prisma.user.findUnique({
        where:  { id: user.id },
        select: { id: true, email: true, name: true, stripeCustomerId: true },
    });
    if (!dbUser) redirect('/dashboard');

    let customerId = dbUser.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email:    dbUser.email ?? undefined,
            name:     dbUser.name  ?? undefined,
            metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const base        = appUrl();
    const amountCents = Math.round(dues.buyInAmount * 100);

    const cs = await stripe.checkout.sessions.create({
        customer:  customerId,
        mode:      'payment',
        line_items: [{
            quantity:   1,
            price_data: {
                currency:     'usd',
                unit_amount:  amountCents,
                product_data: {
                    name:        `League Dues — ${league.leagueName.replace(/\s*\(\d{4}\)\s*$/, '')}`,
                    description: `${league.season} season buy-in · ${member.displayName}`,
                },
            },
        }],
        success_url: `${base}/api/dues/${dues.id}/pay-confirm?session_id={CHECKOUT_SESSION_ID}&memberId=${member.id}&leagueId=${id}`,
        cancel_url:  `${base}/dashboard/league/${id}/overview?dues_cancelled=true`,
        metadata: {
            type:        'LEAGUE_DUES',
            duesId:      dues.id,
            memberId:    member.id,
            buyInAmount: String(dues.buyInAmount),
        },
    });

    redirect(cs.url!);
}
