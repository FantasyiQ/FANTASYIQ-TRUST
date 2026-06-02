import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import NotificationBell from '@/components/notifications/NotificationBell';

export default async function Navbar() {
  const session = await auth();
  const loggedIn = !!session?.user;

  // Derive display tier from active Subscription rows — source of truth.
  // Priority: ELITE > ALL_PRO > PRO. Ignores user.subscriptionTier (can be stale).
  type NavBadge = { label: string; className: string } | null;
  let navBadge: NavBadge = null;
  let isAdmin = false;
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        isAdmin: true,
        subscriptions: {
          where: { status: { in: ['active', 'trialing'] } },
          select: { tier: true },
        },
      },
    });
    // Only PLAYER_* tiers — navbar reflects the user's personal identity, not
    // their commissioner plan (which is league-specific and belongs on league pages).
    isAdmin = user?.isAdmin ?? false;
    const tiers = (user?.subscriptions ?? [])
      .filter(s => s.tier.startsWith('PLAYER_'))
      .map(s => s.tier);
    if (tiers.includes('PLAYER_ELITE')) {
      navBadge = { label: 'ELITE ✦',   className: 'bg-[#D4AF37]/15 border border-[#D4AF37]/50 text-[#D4AF37]' };
    } else if (tiers.includes('PLAYER_ALL_PRO')) {
      navBadge = { label: 'ALL-PRO',   className: 'bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37]/80' };
    } else if (tiers.includes('PLAYER_PRO')) {
      navBadge = { label: 'PRO',       className: 'bg-gray-800 border border-gray-600 text-gray-300' };
    }
  }

  return (
    <nav className="fixed top-0 w-full z-50 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 min-w-0">
        <Link href="/" className="text-lg sm:text-2xl font-bold text-white shrink-0">
          Fantasy<span className="text-[#D4AF37]">i</span>Q Trust
        </Link>
        {/* Scrollable nav items — overflow-x: auto prevents page widening on mobile */}
        <div
          className="flex items-center gap-3 sm:gap-6 overflow-x-auto overflow-y-hidden"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {loggedIn ? (
            <>
              <Link
                href="/dashboard"
                className="text-gray-300 hover:text-white transition text-sm whitespace-nowrap shrink-0"
              >
                My Leagues
              </Link>
              <Link
                href="/leaguefinder"
                className="text-gray-300 hover:text-white transition text-sm whitespace-nowrap shrink-0"
              >
                League Finder
              </Link>
              {navBadge ? (
                <Link
                  href="/pricing"
                  className={`${navBadge.className} font-bold px-2 sm:px-3 py-1 rounded-lg transition text-xs whitespace-nowrap shrink-0 hover:opacity-80`}
                >
                  {navBadge.label}
                </Link>
              ) : (
                <Link href="/pricing" className="text-gray-300 hover:text-white transition text-sm whitespace-nowrap shrink-0">
                  Upgrade
                </Link>
              )}
              <span className="shrink-0">
                <NotificationBell userId={session?.user?.id ?? undefined} />
              </span>
              <Link
                href="/dashboard/account"
                className="text-gray-300 hover:text-white transition text-sm whitespace-nowrap shrink-0"
              >
                Account
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="text-xs font-bold px-2 py-1 rounded-lg bg-red-950/60 border border-red-800/60 text-red-400 hover:text-red-300 hover:border-red-700 transition whitespace-nowrap shrink-0"
                >
                  Admin
                </Link>
              )}
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
                className="shrink-0"
              >
                <button
                  type="submit"
                  className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-3 sm:px-5 py-2 rounded-lg transition text-sm whitespace-nowrap"
                >
                  Sign Out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/leaguefinder" className="text-gray-300 hover:text-white transition text-sm whitespace-nowrap shrink-0">
                League Finder
              </Link>
              <Link href="/pricing" className="text-gray-300 hover:text-white transition text-sm whitespace-nowrap shrink-0">
                Pricing
              </Link>
              <Link href="/support" className="text-gray-300 hover:text-white transition text-sm whitespace-nowrap shrink-0">
                Support
              </Link>
              <Link
                href="/sign-in"
                className="bg-[#D4AF37] hover:bg-[#B8911F] text-gray-950 font-semibold px-3 sm:px-5 py-2 rounded-lg transition text-sm whitespace-nowrap shrink-0"
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
