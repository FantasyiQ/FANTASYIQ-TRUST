import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import LineupPicker, { type Contest, type EntrySlot } from './LineupPicker';

export const dynamic = 'force-dynamic';

interface ScoringConfig { scoringType: string; scoring: Record<string, number> }

function deriveStatus(c: { openAt: Date; lockAt: Date; endAt: Date; isActive: boolean }): string {
    if (!c.isActive) return 'canceled';
    const now = new Date();
    if (now < c.openAt)  return 'upcoming';
    if (now < c.lockAt)  return 'open';
    if (now < c.endAt)   return 'locked';
    return 'complete';
}

function positionColor(pos: string) {
    switch (pos) {
        case 'QB':         return 'text-red-400';
        case 'RB':         return 'text-green-400';
        case 'WR':         return 'text-blue-400';
        case 'TE':         return 'text-yellow-400';
        case 'FLEX':       return 'text-purple-400';
        case 'SUPER_FLEX': return 'text-pink-400';
        case 'K':          return 'text-gray-400';
        case 'DEF':        return 'text-orange-400';
        default:           return 'text-gray-400';
    }
}

export default async function ProBowlEntryPage({ params }: { params: Promise<{ contestId: string }> }) {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) redirect('/sign-in');

    const contest = await prisma.proBowlContest.findUnique({
        where:  { id: contestId },
        select: {
            id:                true,
            name:              true,
            openAt:            true,
            lockAt:            true,
            endAt:             true,
            isActive:          true,
            rosterConfigJson:  true,
            scoringConfigJson: true,
            league:            { select: { leagueName: true, season: true } },
            entries: {
                where:  { userId: user.id },
                select: {
                    id:          true,
                    totalPoints: true,
                    isFinal:     true,
                    slots: {
                        select: { position: true, playerId: true, points: true },
                    },
                },
            },
        },
    });

    if (!contest) notFound();

    const status        = deriveStatus(contest);
    const scoringConfig = contest.scoringConfigJson as unknown as ScoringConfig;
    const existingEntry = contest.entries[0] ?? null;

    // Enrich existing slots with player names for display
    let initialSlots: EntrySlot[] | null = null;
    if (existingEntry && existingEntry.slots.length > 0) {
        const playerIds = existingEntry.slots.map(s => s.playerId);
        const players   = await prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: playerIds } },
            select: { playerId: true, fullName: true, team: true },
        });
        const byId = new Map(players.map(p => [p.playerId, p]));
        initialSlots = existingEntry.slots.map(s => ({
            position: s.position,
            playerId: s.playerId,
            fullName: byId.get(s.playerId)?.fullName ?? s.playerId,
            team:     byId.get(s.playerId)?.team ?? '',
        }));
    }

    const scoringLabel = scoringConfig.scoringType === 'ppr'      ? 'PPR'
                       : scoringConfig.scoringType === 'half_ppr' ? 'Half PPR'
                       : 'Standard';

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
    const scoring = scoringConfig.scoring;

    // Shape contest for LineupPicker — only what it needs
    const contestForPicker: Contest = {
        id:               contest.id,
        rosterConfigJson: contest.rosterConfigJson as Contest['rosterConfigJson'],
    };

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-6">

                <div>
                    <h1 className="text-2xl font-bold">{contest.name}</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {contest.league.leagueName} · {contest.league.season}
                    </p>
                </div>

                {/* Scoring card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="font-bold text-white">League Scoring</h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#C8A951]/20 text-[#C8A951] border border-[#C8A951]/30">
                            {scoringLabel}
                        </span>
                    </div>
                    {Object.keys(scoring).length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                            {KEY_RULES.filter(r => scoring[r.key] != null).map(r => (
                                <div key={r.key} className="flex items-center justify-between gap-2">
                                    <span className="text-gray-500 text-xs">{r.label}</span>
                                    <span className="text-white text-xs font-semibold">
                                        {scoring[r.key] > 0 ? `+${scoring[r.key]}` : scoring[r.key]}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Status gates */}
                {status === 'upcoming' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-500 text-sm">
                        This contest hasn&apos;t opened for entries yet.{' '}
                        Opens {new Date(contest.openAt).toLocaleString()}.
                    </div>
                )}

                {status === 'canceled' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-500 text-sm">
                        This contest has been canceled.
                    </div>
                )}

                {status === 'locked' && !existingEntry && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-500 text-sm">
                        Entries are locked. This contest is no longer accepting lineups.
                    </div>
                )}

                {(status === 'locked' || status === 'complete') && existingEntry && initialSlots && (
                    <LockedEntry
                        slots={initialSlots}
                        entrySlots={existingEntry.slots}
                        totalPoints={existingEntry.totalPoints}
                        isFinal={existingEntry.isFinal}
                        status={status}
                    />
                )}

                {status === 'open' && (
                    <LineupPicker
                        contest={contestForPicker}
                        initialSlots={initialSlots}
                    />
                )}
            </div>
        </main>
    );
}

function LockedEntry({
    slots,
    entrySlots,
    totalPoints,
    isFinal,
    status,
}: {
    slots:      EntrySlot[];
    entrySlots: { position: string; playerId: string; points: number }[];
    totalPoints: number;
    isFinal:    boolean;
    status:     string;
}) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                    <h2 className="font-bold">Your Lineup</h2>
                    {status === 'locked' && !isFinal && (
                        <p className="text-gray-500 text-xs mt-0.5">Entries locked — scoring in progress.</p>
                    )}
                    {isFinal && <p className="text-gray-500 text-xs mt-0.5">Final results.</p>}
                </div>
                {isFinal && (
                    <p className="text-[#C8A951] font-bold text-lg">{totalPoints.toFixed(1)} pts</p>
                )}
            </div>
            <ul className="divide-y divide-gray-800/50">
                {slots.map((slot, i) => {
                    const pts = entrySlots[i]?.points ?? 0;
                    return (
                        <li key={i} className="px-6 py-3 flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-500 w-12 shrink-0">{slot.position}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{slot.fullName ?? slot.playerId}</p>
                                {slot.team && <p className="text-gray-600 text-xs">{slot.team}</p>}
                            </div>
                            {isFinal && (
                                <p className="text-[#C8A951] text-xs font-semibold shrink-0">{pts.toFixed(1)} pts</p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
