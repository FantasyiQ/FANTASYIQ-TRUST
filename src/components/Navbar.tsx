import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';

export default async function Navbar() {
  const session = await auth();
  const loggedIn = !!session?.user;

  return (
    <nav className="fixed top-0 w-full z-50 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-white">
          Fantasy<span className="text-[#C9A227]">i</span>Q Trust
        </Link>
        <div className="flex items-center gap-8">
          <Link href="/" className="text-gray-300 hover:text-white transition">Home</Link>
          <Link href="/pricing" className="text-gray-300 hover:text-white transition">Pricing</Link>
          {loggedIn ? (
            <>
              <Link
                href="/dashboard"
                className="text-gray-300 hover:text-white transition"
              >
                Dashboard
              </Link>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button
                  type="submit"
                  className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-5 py-2 rounded-lg transition"
                >
                  Sign Out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="bg-[#C9A227] hover:bg-[#B8911F] text-gray-950 font-semibold px-5 py-2 rounded-lg transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
