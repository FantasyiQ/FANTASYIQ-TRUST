import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ProBowlLeagueGrid, { type LeagueCard } from './ProBowlLeagueGrid';

export default async function ProBowlPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            connectedLeagues: {
                select: { leagueName: true, platform: true },
                orderBy: { createdAt: 'asc' },
            },
        },
    });

    if (!user) redirect('/sign-in');

    // Fetch all dues trackers for this commissioner with their pro bowl contests
    const duesTrackers = await prisma.leagueDues.findMany({
        where: { commissionerId: user.id },
        select: {
            id:         true,
            leagueName: true,
            proBowl: {
                select: {
                    id:     true,
                    season: true,
                    status: true,
                    _count: { select: { entries: true } },
                },
            },
        },
    });

    // Build a map: leagueName (lowercase) → dues tracker
    const duesMap = new Map(duesTrackers.map(d => [d.leagueName.toLowerCase().trim(), d]));

    // Build league cards from connected leagues
    const leagues: LeagueCard[] = user.connectedLeagues.map(cl => {
        const key   = cl.leagueName.toLowerCase().trim();
        const dues  = duesMap.get(key) ?? null;
        const contest = dues?.proBowl ?? null;
        return {
            leagueName:     cl.leagueName,
            platform:       cl.platform,
            duesId:         dues?.id ?? null,
            contestId:      contest?.id ?? null,
            contestStatus:  contest?.status ?? null,
            contestSeason:  contest?.season ?? null,
            contestEntries: contest?._count.entries ?? 0,
        };
    });

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-6">
                <div>
                    <Link href="/dashboard/commissioner" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Commissioner Hub
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Pro Bowl Contest</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Week 18 free contest — DraftKings-style lineup picks, no salary cap. One contest per league.
                    </p>
                </div>

                <ProBowlLeagueGrid leagues={leagues} />
            </div>
        </main>
    );
}
