import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import LineupPicker from './LineupPicker';

export default async function ProBowlEntryPage({ params }: { params: Promise<{ contestId: string }> }) {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) redirect('/sign-in');

    const contest = await prisma.proBowlContest.findUnique({
        where: { id: contestId },
        select: {
            id: true,
            season: true,
            week: true,
            status: true,
            leagueName: true,
            leagueDues: { select: { leagueName: true } },
            entries: {
                where: { userId: user.id },
                select: { lineup: true },
            },
        },
    });

    if (!contest) notFound();

    const existingEntry = contest.entries[0] ?? null;

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-bold">Pro Bowl Lineup</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {contest.leagueName ?? contest.leagueDues?.leagueName} · {contest.season} Season · Week {contest.week}
                    </p>
                </div>

                {contest.status === 'setup' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-500 text-sm">
                        The commissioner hasn&apos;t opened this contest for entries yet. Check back soon.
                    </div>
                )}

                {contest.status === 'locked' && !existingEntry && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-500 text-sm">
                        Entries are locked. This contest is no longer accepting lineups.
                    </div>
                )}

                {(contest.status === 'locked' || contest.status === 'scoring' || contest.status === 'complete') && existingEntry && (
                    <LockedEntry lineup={existingEntry.lineup as unknown as LineupSlot[]} status={contest.status} />
                )}

                {contest.status === 'open' && (
                    <LineupPicker
                        contestId={contestId}
                        existingLineup={existingEntry ? (existingEntry.lineup as unknown as LineupSlot[]) : null}
                    />
                )}
            </div>
        </main>
    );
}

interface LineupSlot {
    position: string;
    playerName: string;
    nflTeam: string;
    projectedPoints?: number;
}

function LockedEntry({ lineup, status }: { lineup: LineupSlot[]; status: string }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="font-bold">Your Lineup</h2>
                {status === 'locked' && <p className="text-gray-500 text-xs mt-1">Entries are locked — lineup submitted.</p>}
                {status === 'scoring' && <p className="text-gray-500 text-xs mt-1">Scoring in progress…</p>}
                {status === 'complete' && <p className="text-gray-500 text-xs mt-1">Final results posted.</p>}
            </div>
            <ul className="divide-y divide-gray-800/50">
                {lineup.map((slot, i) => (
                    <li key={i} className="px-6 py-3 flex items-center gap-4">
                        <span className="text-xs font-bold text-gray-500 w-10 shrink-0">{slot.position}</span>
                        <div className="flex-1">
                            <p className="text-white text-sm font-medium">{slot.playerName}</p>
                            <p className="text-gray-600 text-xs">{slot.nflTeam}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
