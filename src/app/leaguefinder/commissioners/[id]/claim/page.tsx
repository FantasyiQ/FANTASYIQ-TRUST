export const dynamic = 'force-dynamic';

import { redirect, notFound } from 'next/navigation';
import { auth }    from '@/lib/auth';
import { prisma }  from '@/lib/prisma';
import Link        from 'next/link';
import ClaimButton from './_ClaimButton';

export default async function ClaimCommissionerPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id }  = await params;
    const session = await auth();

    if (!session?.user) {
        redirect(`/sign-in?callbackUrl=/leaguefinder/commissioners/${id}/claim`);
    }

    const commissioner = await prisma.lFCommissioner.findUnique({
        where:   { id },
        include: { leagues: { select: { id: true, name: true } } },
    });

    if (!commissioner) notFound();

    // Already claimed by this user — redirect to edit
    if (commissioner.ownerId === session.user.id) {
        redirect(`/leaguefinder/commissioners/${id}/edit`);
    }

    // Already claimed by someone else
    if (commissioner.claimed) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <div className="text-4xl">🔒</div>
                    <h1 className="text-xl font-bold text-white">Already Claimed</h1>
                    <p className="text-gray-500 text-sm">
                        This commissioner profile has already been claimed.
                        If you believe this is yours, contact support.
                    </p>
                    <Link href={`/leaguefinder/commissioners/${id}`} className="text-[#D4AF37] text-sm hover:underline">
                        ← Back to profile
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-lg mx-auto px-4 py-16 space-y-8">

                <nav className="text-xs text-gray-600 flex items-center gap-1.5">
                    <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                    <span>/</span>
                    <Link href={`/leaguefinder/commissioners/${id}`} className="hover:text-gray-400 transition">
                        {commissioner.displayName}
                    </Link>
                    <span>/</span>
                    <span className="text-white">Claim</span>
                </nav>

                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-5">
                    <div>
                        <h1 className="text-xl font-bold text-white">Claim "{commissioner.displayName}"</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Claiming this profile lets you manage your league listings, respond to reviews, and build your commissioner identity.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">What you get</h3>
                        {[
                            '✏️  Edit your display name and platform handles',
                            '💬  Reply to reviews publicly',
                            '📋  Manage league join requests and waitlists',
                            '📅  Add season history and payout records',
                            '🏅  Earn commissioner badges',
                        ].map(item => (
                            <div key={item} className="text-sm text-gray-300">{item}</div>
                        ))}
                    </div>

                    {commissioner.leagues.length > 0 && (
                        <div className="space-y-1.5">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Leagues included</h3>
                            {commissioner.leagues.map(l => (
                                <div key={l.id} className="text-sm text-gray-400">• {l.name}</div>
                            ))}
                        </div>
                    )}

                    <div className="rounded-lg border border-yellow-900/40 bg-yellow-900/10 px-4 py-3 text-xs text-yellow-500">
                        ⚠️ Claiming is first-come-first-served. If this is your profile, claim it now. False claims may be revoked by moderators.
                    </div>

                    <ClaimButton commissionerId={id} />
                </div>
            </div>
        </div>
    );
}
