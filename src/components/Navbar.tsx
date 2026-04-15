import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import NavClient from './NavClient';

export default async function Navbar() {
    const session = await auth();
    const loggedIn = !!session?.user;

    let tier: string | null = null;

    if (session?.user?.email) {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { subscriptionTier: true },
        });
        tier = user?.subscriptionTier ?? null;
    }

    const signOutAction = async () => {
        'use server';
        await signOut({ redirectTo: '/' });
    };

    return (
        <nav className="fixed top-0 w-full z-50 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between relative">
                <Link href="/" className="text-2xl font-bold text-white shrink-0">
                    Fantasy<span className="text-[#C9A227]">i</span>Q Trust
                </Link>

                {loggedIn ? (
                    <NavClient isElite={tier === 'PLAYER_ELITE' || tier === 'COMMISSIONER_ELITE'} tier={tier} signOutAction={signOutAction} />
                ) : (
                    <div className="flex items-center gap-8">
                        <Link href="/" className="text-gray-300 hover:text-white transition">Home</Link>
                        <Link href="/pricing" className="text-gray-300 hover:text-white transition">Pricing</Link>
                        <Link href="/sign-in" className="bg-[#C9A227] hover:bg-[#B8911F] text-gray-950 font-semibold px-5 py-2 rounded-lg transition">
                            Sign In
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    );
}
