import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDraft, getDraftPicks, getLeagueUsers, type SleeperDraftPick } from '@/lib/sleeper';

// ─── Position badge ───────────────────────────────────────────────────────────

const POS_STYLES: Record<string, string> = {
    QB:  'bg-rose-900/70 text-rose-300',
    RB:  'bg-emerald-900/70 text-emerald-300',
    WR:  'bg-sky-900/70 text-sky-300',
    TE:  'bg-amber-900/70 text-amber-300',
    K:   'bg-violet-900/70 text-violet-300',
    DEF: 'bg-slate-700 text-slate-300',
};

function posBadgeStyle(pos: string) {
    return POS_STYLES[pos] ?? 'bg-gray-700 text-gray-300';
}

// ─── Draft status / type labels ───────────────────────────────────────────────

const DRAFT_STATUS_STYLES: Record<string, string> = {
    pre_draft: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    drafting:  'bg-green-900/40 text-green-400 border-green-800',
    paused:    'bg-gray-700 text-gray-400 border-gray-600',
    complete:  'bg-gray-800 text-gray-500 border-gray-700',
};

function draftStatusLabel(s: string) {
    switch (s) {
        case 'pre_draft': return 'Pre-Draft';
        case 'drafting':  return 'Live';
        case 'paused':    return 'Paused';
        case 'complete':  return 'Complete';
        default:          return s;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format pick as "R.SS" — e.g. "1.01", "3.08" */
function pickLabel(round: number, pickNo: number, teams: number): string {
    const withinRound = ((pickNo - 1) % teams) + 1;
    return `${round}.${String(withinRound).padStart(2, '0')}`;
}

const POSITIONS_OF_INTEREST = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DraftBoardPage({
    params,
}: {
    params: Promise<{ draftId: string }>;
}) {
    const { draftId } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [draft, picks] = await Promise.all([
        getDraft(draftId),
        getDraftPicks(draftId),
    ]);

    const teams  = draft.settings.teams;
    const rounds = draft.settings.rounds;
    const isSnake = draft.type === 'snake';

    // ── Manager names per slot ──────────────────────────────────────────────
    const slotToManager = new Map<number, { name: string; avatar: string | null }>();
    if (draft.league_id && draft.draft_order) {
        try {
            const users = await getLeagueUsers(draft.league_id);
            const userMap = new Map(users.map((u) => [u.user_id, u]));
            for (const [userId, slot] of Object.entries(draft.draft_order)) {
                const u = userMap.get(userId);
                if (u) {
                    slotToManager.set(slot, {
                        name: u.metadata?.team_name || u.display_name,
                        avatar: u.avatar,
                    });
                }
            }
        } catch {
            // League users not critical — fall back to slot numbers
        }
    }

    // ── Build 2-D picks grid: grid[round][draft_slot] = pick ───────────────
    const grid = new Map<number, Map<number, SleeperDraftPick>>();
    for (let r = 1; r <= rounds; r++) grid.set(r, new Map());
    for (const pick of picks) {
        grid.get(pick.round)?.set(pick.draft_slot, pick);
    }

    // ── Summary stats ───────────────────────────────────────────────────────
    const totalPicks  = teams * rounds;
    const madeCount   = picks.length;

    // First off the board per position
    const sortedPicks = [...picks].sort((a, b) => a.pick_no - b.pick_no);
    const firstByPos  = new Map<string, SleeperDraftPick>();
    for (const pick of sortedPicks) {
        if (POSITIONS_OF_INTEREST.includes(pick.metadata.position) &&
            !firstByPos.has(pick.metadata.position)) {
            firstByPos.set(pick.metadata.position, pick);
        }
    }

    // Round-by-round position breakdown (only completed rounds)
    const roundBreakdown = new Map<number, Record<string, number>>();
    for (const pick of picks) {
        if (!roundBreakdown.has(pick.round)) roundBreakdown.set(pick.round, {});
        const rb = roundBreakdown.get(pick.round)!;
        const pos = pick.metadata.position;
        rb[pos] = (rb[pos] ?? 0) + 1;
    }
    const completedRounds = [...roundBreakdown.entries()]
        .filter(([r]) => (roundBreakdown.get(r) ? Object.values(roundBreakdown.get(r)!).reduce((a, b) => a + b, 0) : 0) === teams)
        .map(([r]) => r)
        .sort((a, b) => a - b);

    const draftName = draft.metadata?.name || (draft.league_id ? 'League Draft' : 'Mock Draft');

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-full mx-auto" style={{ maxWidth: '1400px' }}>
                <div className="px-0 space-y-6">

                    {/* Back + header */}
                    <div className="px-0">
                        <Link href="/dashboard/drafts" className="text-gray-500 hover:text-gray-300 text-sm transition">
                            ← Back to Draft Board
                        </Link>
                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                            <h1 className="text-2xl font-bold">{draftName}</h1>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${DRAFT_STATUS_STYLES[draft.status] ?? DRAFT_STATUS_STYLES.complete}`}>
                                {draftStatusLabel(draft.status)}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border border-gray-700 text-gray-400 capitalize">
                                {draft.type}
                            </span>
                        </div>
                        <p className="text-gray-500 text-sm mt-1">
                            {draft.season} · {teams} teams · {rounds} rounds
                            {draft.settings.pick_timer > 0 ? ` · ${draft.settings.pick_timer}s/pick` : ''}
                            {madeCount < totalPicks ? ` · ${madeCount}/${totalPicks} picks made` : ' · Draft complete'}
                        </p>
                    </div>

                    {/* Draft board */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                            <h2 className="font-semibold text-lg">Draft Board</h2>
                            {isSnake && (
                                <span className="text-xs text-gray-600">
                                    Snake draft — odd rounds → | even rounds ←
                                </span>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="border-collapse" style={{ minWidth: `${60 + teams * 130}px` }}>
                                {/* Column headers */}
                                <thead>
                                    <tr className="border-b border-gray-800">
                                        {/* Sticky round label corner */}
                                        <th className="sticky left-0 z-20 bg-gray-900 w-14 min-w-[56px] border-r border-gray-800" />
                                        {Array.from({ length: teams }, (_, i) => i + 1).map((slot) => {
                                            const mgr = slotToManager.get(slot);
                                            return (
                                                <th
                                                    key={slot}
                                                    className="px-2 py-3 text-center border-r border-gray-800/50 last:border-0"
                                                    style={{ width: 130, minWidth: 130 }}
                                                >
                                                    <div className="text-gray-500 text-xs font-medium">Slot {slot}</div>
                                                    {mgr && (
                                                        <div className="text-white text-xs font-semibold mt-0.5 truncate max-w-[118px] mx-auto">
                                                            {mgr.name}
                                                        </div>
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>

                                {/* Rounds */}
                                <tbody>
                                    {Array.from({ length: rounds }, (_, ri) => ri + 1).map((round) => {
                                        const isEven = round % 2 === 0;
                                        const rowBg = isEven ? 'bg-gray-950/40' : '';
                                        const roundPicks = grid.get(round)!;

                                        return (
                                            <tr key={round} className={`border-b border-gray-800/50 last:border-0 ${rowBg}`}>
                                                {/* Sticky round label */}
                                                <td className={`sticky left-0 z-10 border-r border-gray-800 w-14 min-w-[56px] text-center ${isEven ? 'bg-gray-950' : 'bg-gray-900'}`}>
                                                    <div className="text-gray-500 text-xs font-semibold py-2">
                                                        R{round}
                                                    </div>
                                                    {isSnake && (
                                                        <div className="text-gray-700 text-[10px] pb-1">
                                                            {isEven ? '←' : '→'}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Pick cells */}
                                                {Array.from({ length: teams }, (_, i) => i + 1).map((slot) => {
                                                    const pick = roundPicks.get(slot);
                                                    return (
                                                        <td
                                                            key={slot}
                                                            className="border-r border-gray-800/30 last:border-0 align-top p-0"
                                                            style={{ width: 130, minWidth: 130 }}
                                                        >
                                                            {pick ? (
                                                                <div className="px-2 py-2 h-full min-h-[70px] flex flex-col gap-1">
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${posBadgeStyle(pick.metadata.position)}`}>
                                                                            {pick.metadata.position}
                                                                        </span>
                                                                        <span className="text-gray-600 text-[10px] shrink-0">
                                                                            {pickLabel(round, pick.pick_no, teams)}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-white text-xs font-medium leading-tight line-clamp-2">
                                                                        {pick.metadata.first_name} {pick.metadata.last_name}
                                                                    </p>
                                                                    <p className="text-gray-600 text-[10px] mt-auto">
                                                                        {pick.metadata.team || 'FA'}
                                                                        {pick.is_keeper && (
                                                                            <span className="ml-1 text-[#C8A951]">K</span>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            ) : (
                                                                <div className="px-2 py-2 h-full min-h-[70px] flex items-center justify-center">
                                                                    <span className="text-gray-800 text-xs">—</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Summary + breakdown grid */}
                    <div className="grid sm:grid-cols-2 gap-6">

                        {/* First off the board */}
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                            <h2 className="font-semibold text-lg mb-4">First Off the Board</h2>
                            {firstByPos.size === 0 ? (
                                <p className="text-gray-600 text-sm">No picks made yet.</p>
                            ) : (
                                <dl className="space-y-3 text-sm">
                                    {POSITIONS_OF_INTEREST.map((pos) => {
                                        const pick = firstByPos.get(pos);
                                        if (!pick) return null;
                                        return (
                                            <div key={pos} className="flex items-center gap-3">
                                                <span className={`w-9 text-center text-[10px] font-bold px-1 py-0.5 rounded ${posBadgeStyle(pos)}`}>
                                                    {pos}
                                                </span>
                                                <span className="flex-1 text-white font-medium truncate">
                                                    {pick.metadata.first_name} {pick.metadata.last_name}
                                                </span>
                                                <span className="text-gray-500 shrink-0">
                                                    {pickLabel(pick.round, pick.pick_no, teams)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </dl>
                            )}
                        </div>

                        {/* Round-by-round breakdown */}
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                            <h2 className="font-semibold text-lg mb-4">Round Breakdown</h2>
                            {completedRounds.length === 0 ? (
                                <p className="text-gray-600 text-sm">No completed rounds yet.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-gray-500 border-b border-gray-800">
                                                <th className="py-1.5 pr-3 text-left font-medium">Rnd</th>
                                                {POSITIONS_OF_INTEREST.map((p) => (
                                                    <th key={p} className="py-1.5 px-2 text-center font-medium">{p}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {completedRounds.map((r) => {
                                                const rb = roundBreakdown.get(r) ?? {};
                                                return (
                                                    <tr key={r} className="border-b border-gray-800/40 last:border-0">
                                                        <td className="py-2 pr-3 text-gray-400 font-medium">R{r}</td>
                                                        {POSITIONS_OF_INTEREST.map((pos) => (
                                                            <td key={pos} className="py-2 px-2 text-center text-gray-300">
                                                                {rb[pos] ?? 0}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                    </div>

                </div>
            </div>
        </main>
    );
}
