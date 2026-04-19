import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function Navbar() {
  const session = await auth();
  const loggedIn = !!session?.user;

  // Read tier from DB — not from JWT, which is stale after an upgrade
  let isElite = false;
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { subscriptionTier: true },
    });
    isElite =
      user?.subscriptionTier === 'PLAYER_ELITE' ||
      user?.subscriptionTier === 'COMMISSIONER_ELITE';
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
              {isElite ? (
                <Link
                  href="/pricing"
                  className="bg-[#C9A227]/15 border border-[#C9A227]/50 text-[#C9A227] font-bold px-2 sm:px-3 py-1 rounded-lg transition text-xs sm:text-sm whitespace-nowrap"
                >
                  Elite ✦
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
