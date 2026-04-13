import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLockedTeams } from '@/lib/nfl-schedule';
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
            scoringSettings: true,
            leagueDues: { select: { leagueName: true } },
            entries: {
                where: { userId: user.id },
                select: { lineup: true },
            },
        },
    });

    if (!contest) notFound();

    const existingEntry   = contest.entries[0] ?? null;
    // Fetch locked teams for slot-level locking (non-fatal — empty set = nothing locked yet)
    const lockedTeamSet   = contest.status === 'open'
        ? await getLockedTeams(contest.season, contest.week)
        : new Set<string>();
    const lockedTeams     = Array.from(lockedTeamSet) as string[];

    const settings = contest.scoringSettings as {
        rosterPositions?: string[];
        scoringType?: string;
        scoring?: Record<string, number>;
    } | null;
    const rosterPositions = settings?.rosterPositions ?? ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
    const scoringType     = settings?.scoringType ?? 'std';

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-bold">Pro Bowl Lineup</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {contest.leagueName ?? contest.leagueDues?.leagueName} · {contest.season} Season · Week {contest.week}
                    </p>
                </div>

                {/* Scoring summary */}
                <ScoringCard scoringType={scoringType} scoring={settings?.scoring ?? {}} rosterPositions={rosterPositions} />

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
                        rosterPositions={rosterPositions}
                        lockedTeams={lockedTeams}
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

function ScoringCard({ scoringType, scoring, rosterPositions }: {
    scoringType: string;
    scoring: Record<string, number>;
    rosterPositions: string[];
}) {
    const scoringLabel = scoringType === 'ppr' ? 'PPR' : scoringType === 'half_ppr' ? 'Half PPR' : 'Standard';

    const KEY_RULES: { key: string; label: string }[] = [
        { key: 'pass_td',  label: 'Pass TD' },
        { key: 'pass_yd',  label: 'Pass Yd' },
        { key: 'rush_td',  label: 'Rush TD' },
        { key: 'rush_yd',  label: 'Rush Yd' },
        { key: 'rec_td',   label: 'Rec TD' },
        { key: 'rec_yd',   label: 'Rec Yd' },
        { key: 'rec',      label: 'Reception' },
        { key: 'fum_lost', label: 'Fumble Lost' },
        { key: 'int',      label: 'INT (thrown)' },
    ];

    const hasScoring = Object.keys(scoring).length > 0;
    const starters   = rosterPositions.filter(p => !['BN','IR','TAXI'].includes(p));

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-bold text-white">League Scoring</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#C8A951]/20 text-[#C8A951] border border-[#C8A951]/30">
                    {scoringLabel}
                </span>
            </div>

            <div>
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Lineup Format</p>
                <div className="flex flex-wrap gap-1.5">
                    {starters.map((pos, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs font-bold text-gray-300">
                            {pos}
                        </span>
                    ))}
                </div>
            </div>

            {hasScoring && (
                <div>
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Key Scoring Rules</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                        {KEY_RULES.filter(r => scoring[r.key] != null).map(r => (
                            <div key={r.key} className="flex items-center justify-between gap-2">
                                <span className="text-gray-500 text-xs">{r.label}</span>
                                <span className="text-white text-xs font-semibold">{scoring[r.key] > 0 ? `+${scoring[r.key]}` : scoring[r.key]}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
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
