import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueDrafts, getNflState, type SleeperDraft } from '@/lib/sleeper';

// ─── Badge helpers ────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
    snake:   'bg-blue-900/40 text-blue-300 border-blue-800',
    linear:  'bg-purple-900/40 text-purple-300 border-purple-800',
    auction: 'bg-amber-900/40 text-amber-300 border-amber-800',
};

const STATUS_STYLES: Record<string, string> = {
    pre_draft: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    drafting:  'bg-green-900/40 text-green-400 border-green-800',
    paused:    'bg-gray-700 text-gray-400 border-gray-600',
    complete:  'bg-gray-800 text-gray-500 border-gray-700',
};

function statusLabel(s: string) {
    switch (s) {
        case 'pre_draft': return 'Pre-Draft';
        case 'drafting':  return 'Drafting';
        case 'paused':    return 'Paused';
        case 'complete':  return 'Complete';
        default:          return s;
    }
}

function typeLabel(t: string) {
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

// ─── Draft card ───────────────────────────────────────────────────────────────

function DraftCard({ draft }: { draft: SleeperDraft }) {
    const name = draft.metadata?.name || (draft.league_id ? 'League Draft' : 'Mock Draft');
    const isMock = draft.league_id === null;

    return (
        <Link
            href={`/dashboard/drafts/${draft.draft_id}`}
            className="block bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-2xl p-5 transition group"
        >
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white group-hover:text-[#C8A951] transition truncate">
                        {name}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                        {draft.settings.teams} teams · {draft.settings.rounds} rounds
                        {draft.settings.pick_timer > 0 ? ` · ${draft.settings.pick_timer}s/pick` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${TYPE_STYLES[draft.type] ?? TYPE_STYLES.snake}`}>
                        {typeLabel(draft.type)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[draft.status] ?? STATUS_STYLES.complete}`}>
                        {statusLabel(draft.status)}
                    </span>
                    {isMock && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-gray-700 text-gray-500">
                            Mock
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
                <span>{draft.season} Season</span>
                {draft.metadata?.scoring_type && (
                    <span className="capitalize">{draft.metadata.scoring_type.replace('_', ' ')}</span>
                )}
                <span>{formatDate(draft.created)}</span>
            </div>
        </Link>
    );
}

function DraftSection({ title, drafts }: { title: string; drafts: SleeperDraft[] }) {
    if (drafts.length === 0) return null;
    return (
        <section>
            <h2 className="font-semibold text-lg mb-3">{title}</h2>
            <div className="space-y-3">
                {drafts.map((d) => <DraftCard key={d.draft_id} draft={d} />)}
            </div>
        </section>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DraftsPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const leagues = await prisma.league.findMany({
        where: { userId: session.user.id },
        select: { leagueId: true },
    });

    if (leagues.length === 0) {
        return (
            <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
                <div className="max-w-3xl mx-auto">
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold mt-4 mb-8">Draft Board</h1>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
                        <p className="text-gray-400 mb-1">No leagues synced yet.</p>
                        <p className="text-gray-600 text-sm mb-5">Sync a Sleeper league first to view your drafts.</p>
                        <Link
                            href="/dashboard/sync"
                            className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm"
                        >
                            Sync a League
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    const nflState = await getNflState();
    const currentSeason = nflState.season;
    const prevSeason = String(Number(currentSeason) - 1);

    // Fetch drafts for every synced league in parallel; silently ignore failures
    const draftArrays = await Promise.all(
        leagues.map((l) => getLeagueDrafts(l.leagueId).catch(() => [] as SleeperDraft[]))
    );

    // Deduplicate across leagues, sort newest first
    const seen = new Set<string>();
    const allDrafts: SleeperDraft[] = [];
    for (const arr of draftArrays) {
        for (const d of arr) {
            if (!seen.has(d.draft_id)) {
                seen.add(d.draft_id);
                allDrafts.push(d);
            }
        }
    }
    allDrafts.sort((a, b) => b.created - a.created);

    const current  = allDrafts.filter((d) => d.season === currentSeason);
    const previous = allDrafts.filter((d) => d.season === prevSeason);
    const older    = allDrafts.filter((d) => d.season !== currentSeason && d.season !== prevSeason);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-3xl mx-auto space-y-8">

                <div>
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Draft Board</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        {allDrafts.length} draft{allDrafts.length !== 1 ? 's' : ''} across {leagues.length} synced league{leagues.length !== 1 ? 's' : ''}
                    </p>
                </div>

                {allDrafts.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
                        <p className="text-gray-400 mb-1">No drafts found.</p>
                        <p className="text-gray-600 text-sm">Drafts will appear here once your leagues have created them.</p>
                    </div>
                ) : (
                    <>
                        <DraftSection title={`${currentSeason} Season`} drafts={current} />
                        <DraftSection title={`${prevSeason} Season`} drafts={previous} />
                        {older.length > 0 && <DraftSection title="Earlier" drafts={older} />}
                    </>
                )}

            </div>
        </main>
    );
}
