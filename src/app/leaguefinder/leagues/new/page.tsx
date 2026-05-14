export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth }     from '@/lib/auth';
import { prisma }   from '@/lib/prisma';
import Link         from 'next/link';
import ListLeagueForm from './_ListLeagueForm';

export default async function ListLeaguePage() {
    const session = await auth();
    if (!session?.user) redirect('/sign-in?callbackUrl=/leaguefinder/leagues/new');

    // Must have a claimed commissioner profile to list a league
    const commissioner = await prisma.lFCommissioner.findUnique({
        where: { ownerId: session.user.id },
    });

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-lg mx-auto px-4 py-12 space-y-8">

                <nav className="text-xs text-gray-600 flex items-center gap-1.5">
                    <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                    <span>/</span>
                    <span className="text-white">List a League</span>
                </nav>

                {!commissioner ? (
                    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center space-y-4">
                        <div className="text-4xl">🏈</div>
                        <h1 className="text-xl font-bold text-white">Commissioner Profile Required</h1>
                        <p className="text-gray-500 text-sm">
                            You need a commissioner profile before listing a league.
                        </p>
                        <Link
                            href="/leaguefinder/commissioners/new"
                            className="inline-block px-5 py-2.5 rounded-xl font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition"
                        >
                            Register as Commissioner
                        </Link>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-6">
                        <div>
                            <h1 className="text-xl font-bold text-white">List a League</h1>
                            <p className="text-gray-500 text-sm mt-1">
                                Add your league to League Finder so players can discover it and leave reviews.
                            </p>
                        </div>
                        <ListLeagueForm commissionerId={commissioner.id} />
                    </div>
                )}
            </div>
        </div>
    );
}
