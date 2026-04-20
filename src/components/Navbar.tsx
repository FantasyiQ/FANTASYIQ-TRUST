import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function Navbar() {
  const session = await auth();
  const loggedIn = !!session?.user;

  // Derive display tier from active Subscription rows — source of truth.
  // Priority: ELITE > ALL_PRO > PRO. Ignores user.subscriptionTier (can be stale).
  type NavBadge = { label: string; className: string } | null;
  let navBadge: NavBadge = null;
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        subscriptions: {
          where: { status: { in: ['active', 'trialing'] } },
          select: { tier: true },
        },
      },
    });
    // Only PLAYER_* tiers — navbar reflects the user's personal identity, not
    // their commissioner plan (which is league-specific and belongs on league pages).
    const tiers = (user?.subscriptions ?? [])
      .filter(s => s.tier.startsWith('PLAYER_'))
      .map(s => s.tier);
    if (tiers.includes('PLAYER_ELITE')) {
      navBadge = { label: 'ELITE ✦',  className: 'bg-[#C9A227]/15 border border-[#C9A227]/50 text-[#C9A227]' };
    } else if (tiers.includes('PLAYER_ALL_PRO')) {
      navBadge = { label: 'ALL-PRO', className: 'bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227]/80' };
    } else if (tiers.includes('PLAYER_PRO')) {
      navBadge = { label: 'PRO',     className: 'bg-gray-800 border border-gray-600 text-gray-300' };
    }
  }

  return (
    <nav className="fixed top-0 w-full z-50 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
        <Link href="/" className="text-lg sm:text-2xl font-bold text-white shrink-0">
          Fantasy<span className="text-[#C9A227]">i</span>Q Trust
        </Link>
        <div className="flex items-center gap-3 sm:gap-6">
          {loggedIn ? (
            <>
              <Link
                href="/dashboard"
                className="text-gray-300 hover:text-white transition text-sm sm:text-base whitespace-nowrap"
              >
                My Leagues
              </Link>
              {navBadge ? (
                <Link
                  href="/pricing"
                  className={`${navBadge.className} font-bold px-2 sm:px-3 py-1 rounded-lg transition text-xs sm:text-sm whitespace-nowrap hover:opacity-80`}
                >
                  {navBadge.label}
                </Link>
              ) : (
                <Link href="/pricing" className="text-gray-300 hover:text-white transition text-sm sm:text-base whitespace-nowrap">
                  Upgrade
                </Link>
              )}
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button
                  type="submit"
                  className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-3 sm:px-5 py-2 rounded-lg transition text-sm sm:text-base whitespace-nowrap"
                >
                  Sign Out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/pricing" className="text-gray-300 hover:text-white transition text-sm sm:text-base whitespace-nowrap">
                Pricing
              </Link>
              <Link
                href="/sign-in"
                className="bg-[#C9A227] hover:bg-[#B8911F] text-gray-950 font-semibold px-3 sm:px-5 py-2 rounded-lg transition text-sm sm:text-base whitespace-nowrap"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
