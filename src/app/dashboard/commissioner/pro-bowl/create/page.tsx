import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import CreateProBowlForm from '../CreateProBowlForm';

export const dynamic = 'force-dynamic';

export default async function CreateProBowlPage({
    searchParams,
}: {
    searchParams: Promise<{ leagueId?: string }>;
}) {
    const { leagueId } = await searchParams;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) redirect('/sign-in');

    if (!leagueId) redirect('/dashboard/commissioner/pro-bowl');

    const league = await prisma.league.findFirst({
        where: { id: leagueId, userId: user.id },
        select: { id: true, leagueName: true, season: true },
    });
    if (!league) redirect('/dashboard/commissioner/pro-bowl');

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-xl mx-auto space-y-6">
                <div>
                    <Link href="/dashboard/commissioner/pro-bowl"
                        className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Pro Bowl
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">New Contest</h1>
                    <p className="text-gray-400 text-sm mt-1">{league.leagueName} · {league.season}</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <CreateProBowlForm leagueId={league.id} leagueName={league.leagueName} />
                </div>
            </div>
        </main>
    );
}
