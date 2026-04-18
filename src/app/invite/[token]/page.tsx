import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    const invite = await prisma.leagueInvite.findUnique({
        where: { token },
        select: { leagueName: true, season: true, sleeperLeagueId: true },
    });

    if (!invite) notFound();

    const leaguePath = `/dashboard/league/${invite.sleeperLeagueId}`;

    // Already logged in — send directly to the league page
    const session = await auth();
    if (session?.user) redirect(leaguePath);

    const signInHref = `/sign-in?redirect=${encodeURIComponent(leaguePath)}`;
    const signUpHref = `/sign-up?redirect=${encodeURIComponent(leaguePath)}`;

    return (
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="text-5xl">🏆</div>
                <div>
                    <p className="text-gray-500 text-sm uppercase tracking-widest mb-1">You&apos;re invited to</p>
                    <h1 className="text-3xl font-bold">{invite.leagueName}</h1>
                    <p className="text-gray-500 text-sm mt-1">{invite.season} Season</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3 text-left">
                    <p className="text-gray-300 text-sm leading-relaxed">
                        Your commissioner has invited you to track dues, payouts, standings, and trades for{' '}
                        <strong className="text-white">{invite.leagueName}</strong> on{' '}
                        <span className="text-[#C8A951] font-semibold">FantasyIQ Trust</span>.
                    </p>
                    <ul className="space-y-1.5 text-gray-500 text-xs">
                        <li>✓ See who&apos;s paid dues and who hasn&apos;t</li>
                        <li>✓ View payout structure and standings</li>
                        <li>✓ Trade evaluator powered by real dynasty values</li>
                        <li>✓ League announcements from your commissioner</li>
                    </ul>
                </div>

                <div className="space-y-3">
                    <Link
                        href={signInHref}
                        className="block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold py-3 px-6 rounded-xl transition text-sm"
                    >
                        Sign In to Get Started →
                    </Link>
                    <Link
                        href={signUpHref}
                        className="block bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition text-sm"
                    >
                        Create a Free Account
                    </Link>
                </div>

                <p className="text-gray-700 text-xs">
                    Connect your Sleeper account after signing in and{' '}
                    <strong className="text-gray-600">{invite.leagueName}</strong> will appear automatically.
                </p>
            </div>
        </main>
    );
}
