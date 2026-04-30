import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ContestControls from './ContestControls';

export const dynamic = 'force-dynamic';

interface SlotConfig    { position: string; allowedPositions: string[] }
interface RosterConfig  { slots: SlotConfig[] }
interface ScoringConfig { scoringType: string; scoring: Record<string, number> }

function deriveStatus(c: { openAt: Date; lockAt: Date; endAt: Date; isActive: boolean }): string {
    if (!c.isActive) return 'canceled';
    const now = new Date();
    if (now < c.openAt)  return 'upcoming';
    if (now < c.lockAt)  return 'open';
    if (now < c.endAt)   return 'locked';
    return 'complete';
}

export default async function ManageProBowlPage({ params }: { params: Promise<{ contestId: string }> }) {
    const { contestId } = await params;
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
    });
    if (!user) redirect('/sign-in');

    const contest = await prisma.proBowlContest.findUnique({
        where:   { id: contestId },
        include: {
            league:  { select: { id: true, leagueName: true, season: true, userId: true } },
            entries: {
                orderBy: [{ totalPoints: 'desc' }, { createdAt: 'asc' }],
                include: {
                    user:  { select: { name: true, email: true } },
                    slots: { select: { position: true, playerId: true, salary: true, points: true } },
                },
            },
        },
    });

    if (!contest) notFound();
    if (contest.league.userId !== user.id) redirect('/dashboard/commissioner/pro-bowl');

    const status        = deriveStatus(contest);
    const entryUrl      = `/dashboard/pro-bowl/${contestId}`;
    const rosterConfig  = contest.rosterConfigJson  as unknown as RosterConfig;
    const scoringConfig = contest.scoringConfigJson as unknown as ScoringConfig;
    const scoringLabel  = scoringConfig.scoringType === 'ppr'      ? 'PPR'
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

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div>
                    <Link href="/dashboard/commissioner/pro-bowl"
                        className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Pro Bowl
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">{contest.name}</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {contest.league.leagueName} · {contest.league.season}
                    </p>
                </div>

                {/* Controls */}
                <ContestControls
                    contestId={contestId}
                    status={status}
                    isActive={contest.isActive}
                    openAt={contest.openAt.toISOString()}
                    lockAt={contest.lockAt.toISOString()}
                    endAt={contest.endAt.toISOString()}
                    entryUrl={entryUrl}
                />

                {/* Lineup & scoring */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="font-bold">Lineup &amp; Scoring</h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#C8A951]/20 text-[#C8A951] border border-[#C8A951]/30">
                            {scoringLabel}
                        </span>
                    </div>

                    <div>
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">
                            Roster Slots ({rosterConfig.slots.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {rosterConfig.slots.map((slot, i) => (
                                <div key={i} className="flex flex-col items-center gap-0.5">
                                    <span className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm font-semibold text-gray-300">
                                        {slot.position}
                                    </span>
                                    {slot.allowedPositions.length > 1 && (
                                        <span className="text-gray-600 text-xs">
                                            {slot.allowedPositions.join('/')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {Object.keys(scoringConfig.scoring).length > 0 && (
                        <div>
                            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Key Scoring Rules</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                                {KEY_RULES.filter(r => scoringConfig.scoring[r.key] != null).map(r => (
                                    <div key={r.key} className="flex items-center justify-between gap-2">
                                        <span className="text-gray-500 text-xs">{r.label}</span>
                                        <span className="text-white text-xs font-semibold">
                                            {scoringConfig.scoring[r.key] > 0
                                                ? `+${scoringConfig.scoring[r.key]}`
                                                : scoringConfig.scoring[r.key]}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Entries */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                        <h2 className="font-bold">Entries</h2>
                        <span className="text-gray-500 text-sm">{contest.entries.length} submitted</span>
                    </div>

                    {contest.entries.length === 0 ? (
                        <div className="px-6 py-10 text-center text-gray-500 text-sm">
                            No entries yet. Share the entry link with your league members.
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-800/50">
                            {contest.entries.map((entry, i) => {
                                const salaryCost = entry.slots.reduce((sum, s) => sum + s.salary, 0);
                                return (
                                    <li key={entry.id} className="px-6 py-4 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-gray-600 text-sm w-5">{i + 1}.</span>
                                            <div>
                                                <p className="text-white text-sm font-medium">
                                                    {entry.user.name ?? entry.user.email}
                                                </p>
                                                <p className="text-gray-600 text-xs">
                                                    {entry.slots.length} slots · ${salaryCost.toLocaleString()} used ·{' '}
                                                    {new Date(entry.createdAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            {entry.isFinal ? (
                                                <p className="text-[#C8A951] font-bold">{entry.totalPoints.toFixed(1)} pts</p>
                                            ) : (
                                                <p className="text-gray-600 text-xs">Awaiting scoring</p>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Share link (when open) */}
                {status === 'open' && (
                    <div className="bg-[#C8A951]/10 border border-[#C8A951]/30 rounded-2xl p-5">
                        <p className="text-sm font-semibold text-[#C8A951] mb-1">Share Entry Link</p>
                        <p className="text-gray-400 text-xs mb-3">
                            Send this to your league members. They need a FantasyiQ account to enter.
                        </p>
                        <code className="block bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 truncate">
                            {/* populated on client via copy button in ContestControls */}
                            {entryUrl}
                        </code>
                    </div>
                )}
            </div>
        </main>
    );
}
