import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ClaimClient from './ClaimClient';

export const metadata: Metadata = {
    title: 'Claim Your Winnings — FantasyiQ Trust',
    robots: { index: false },
};

export default async function ClaimWinningsPage({
    params,
    searchParams,
}: {
    params:       Promise<{ token: string }>;
    searchParams: Promise<{ status?: string; refresh?: string }>;
}) {
    const { token }  = await params;
    const { status } = await searchParams;

    const item = await prisma.payoutProposalItem.findUnique({
        where:   { winnerClaimToken: token },
        include: {
            payoutSpot: { select: { label: true } },
            proposal:   { include: { leagueDues: { select: { leagueName: true } } } },
            member:     { select: { stripeConnectAccountId: true } },
        },
    });

    if (!item) notFound();

    const alreadyDone = item.status === 'transfer_initiated' || item.status === 'paid_out';

    return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
            <div className="w-full max-w-md">

                {/* Logo / branding */}
                <div className="text-center mb-8">
                    <p className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase mb-1">FiQ</p>
                    <p className="text-gray-600 text-xs">Secure Payout Portal</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
                    <ClaimClient
                        token={token}
                        leagueName={item.proposal.leagueDues.leagueName}
                        spotLabel={item.payoutSpot.label}
                        amount={item.amount}
                        status={status ?? null}
                        alreadyDone={alreadyDone}
                    />
                </div>

                <p className="text-center text-xs text-gray-700 mt-6">
                    Powered by FantasyiQ Trust · Payouts secured by Stripe
                </p>
            </div>
        </div>
    );
}
