export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getLeagueById } from '@/lib/db/leagues';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import BackToOverview from '../../_components/BackToOverview';
import DuesPayConfirm from './DuesPayConfirm';

function appUrl() {
    return (() => { const u = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL; if (!u) throw new Error('NEXTAUTH_URL is not configured'); return u; })();
}

export default async function PayDuesPage({
    params,
    searchParams,
}: {
    params:       Promise<{ id: string }>;
    searchParams: Promise<{ memberId?: string }>;
}) {
    const { id }       = await params;
    const { memberId: pickedMemberId } = await searchParams;

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
                <BackToOverview leagueId={id} />
                <p className="text-gray-400">No dues have been set for this league yet.</p>
            </div>
        );
    }

    const dbUser = await prisma.user.findUnique({
        where:  { id: user.id },
        select: { id: true, email: true, name: true, stripeCustomerId: true, sleeperUserId: true },
    });
    if (!dbUser) redirect('/dashboard');

    const allMembers = await prisma.duesMember.findMany({
        where:  { leagueDuesId: dues.id },
        select: { id: true, duesStatus: true, displayName: true, userId: true, email: true, sleeperUserId: true },
    });

    // Four-tier auto-match: userId → sleeperUserId → email → displayName
    let member = allMembers.find(m =>
        (m.userId       != null && m.userId === user.id) ||
        (m.sleeperUserId != null && dbUser.sleeperUserId != null &&
            m.sleeperUserId === dbUser.sleeperUserId) ||
        (m.email        != null && dbUser.email != null &&
            m.email.toLowerCase() === dbUser.email.toLowerCase()) ||
        (m.userId == null && m.email == null && dbUser.name != null &&
            m.displayName.toLowerCase() === dbUser.name.toLowerCase())
    ) ?? null;

    // Persist userId link once matched so future visits skip the lookup entirely
    if (member && !member.userId) {
        await prisma.duesMember.update({
            where: { id: member.id },
            data:  { userId: user.id },
        }).catch(() => {}); // ignore unique constraint if another request raced
    }

    // If user manually picked their slot via the picker, use that
    if (!member && pickedMemberId) {
        const picked = allMembers.find(m => m.id === pickedMemberId);
        if (picked && picked.duesStatus !== 'paid') {
            member = picked;
            await prisma.duesMember.update({
                where: { id: picked.id },
                data:  { userId: user.id },
            });
        }
    }

    if (member?.duesStatus === 'paid') {
        return (
            <div className="max-w-xl mx-auto mt-10 space-y-4">
                <BackToOverview leagueId={id} />
                <p className="text-green-400 font-medium">You have already paid your dues for this season.</p>
            </div>
        );
    }

    // No auto-match and no pick yet — show slot picker
    if (!member) {
        const unpaid = allMembers.filter(m => m.duesStatus !== 'paid');
        return (
            <div className="max-w-xl mx-auto mt-10 space-y-6">
                <BackToOverview leagueId={id} />
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    <h2 className="text-lg font-semibold">Which team are you?</h2>
                    <p className="text-sm text-gray-400">
                        We couldn&apos;t automatically match your account to a member slot.
                        Select your team below to continue to payment.
                    </p>
                    {unpaid.length === 0 ? (
                        <p className="text-sm text-gray-500">All members have already paid.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {unpaid.map(m => (
                                <Link
                                    key={m.id}
                                    href={`/dashboard/league/${id}/dues/pay?memberId=${m.id}`}
                                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 hover:border-[#D4AF37]/50 hover:bg-gray-800/80 transition group"
                                >
                                    <span className="font-medium text-sm">{m.displayName}</span>
                                    <span className="text-xs text-[#D4AF37] opacity-0 group-hover:opacity-100 transition">
                                        Pay dues →
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Server action: create Stripe session on confirmed TOS acceptance ──────
    async function createSession() {
        'use server';

        let customerId = dbUser!.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email:    dbUser!.email ?? undefined,
                name:     dbUser!.name  ?? undefined,
                metadata: { userId: user.id },
            });
            customerId = customer.id;
            await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
        }

        const base        = appUrl();
        const amountCents = Math.round(dues!.buyInAmount * 100);

        const cs = await stripe.checkout.sessions.create({
            customer:  customerId,
            mode:      'payment',
            line_items: [{
                quantity:   1,
                price_data: {
                    currency:     'usd',
                    unit_amount:  amountCents,
                    product_data: {
                        name:        `League Dues — ${league!.leagueName.replace(/\s*\(\d{4}\)\s*$/, '')}`,
                        description: `${league!.season} season buy-in · ${member!.displayName}`,
                    },
                },
            }],
            success_url: `${base}/api/dues/${dues!.id}/pay-confirm?session_id={CHECKOUT_SESSION_ID}&memberId=${member!.id}&leagueId=${id}`,
            cancel_url:  `${base}/dashboard/league/${id}/overview?dues_cancelled=true`,
            metadata: {
                type:        'LEAGUE_DUES',
                duesId:      dues!.id,
                memberId:    member!.id,
                buyInAmount: String(dues!.buyInAmount),
            },
        });

        redirect(cs.url!);
    }

    // ── Confirmation screen with TOS + trust callout ──────────────────────────
    return (
        <div className="max-w-xl mx-auto mt-10 space-y-6">
            <BackToOverview leagueId={id} />
            <DuesPayConfirm
                leagueName={league.leagueName}
                season={league.season}
                memberName={member.displayName}
                amount={dues.buyInAmount}
                createSession={createSession}
            />
        </div>
    );
}
