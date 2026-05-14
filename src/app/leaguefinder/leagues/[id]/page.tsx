export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { auth }     from '@/lib/auth';
import { prisma }   from '@/lib/prisma';
import { Prisma }   from '@prisma/client';
import Link         from 'next/link';
import { RatingLabel, StarRating } from '@/components/leaguefinder/StarRating';
import CommissionerCard   from '@/components/leaguefinder/CommissionerCard';
import ReviewForm         from '@/components/leaguefinder/ReviewForm';
import ReviewVoteButtons  from '@/components/leaguefinder/ReviewVoteButtons';
import JoinRequestButton  from '@/components/leaguefinder/JoinRequestButton';

type LeagueReviewRow = Prisma.LFReviewGetPayload<{
    include: {
        reviewer: { select: { id: true; name: true } };
        votes:    { select: { helpful: true } };
    };
}>;

export default async function LeagueProfilePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id }  = await params;
    const session = await auth();
    const userId  = session?.user?.id;

    const league = await prisma.lFLeague.findUnique({
        where:   { id },
        include: {
            commissioner: true,
            seasons:      { orderBy: { year: 'desc' } },
            reviews: {
                orderBy: [{ verified: 'desc' }, { helpfulCount: 'desc' }, { seasonYear: 'desc' }],
                take:    20,
                include: {
                    reviewer: { select: { id: true, name: true } },
                    votes:    { where: { voterId: userId ?? '__none__' }, select: { helpful: true } },
                },
            },
            // Current user's join request status
            joinRequests: userId
                ? { where: { userId }, select: { status: true }, take: 1 }
                : false,
        },
    });

    if (!league) notFound();

    const { commissioner } = league;
    const handles  = (commissioner.platformHandles ?? {}) as Record<string, string>;
    const reviews  = league.reviews as LeagueReviewRow[];
    const isOwner  = commissioner.ownerId === userId;
    const myRequest = (league.joinRequests as { status: string }[] | false | undefined);
    const myStatus  = Array.isArray(myRequest) ? (myRequest[0]?.status ?? null) : null;

    const avgRatings = reviews.length > 0 ? {
        overall:   avg(reviews.map(r => r.ratingOverall)),
        fairness:  avg(reviews.map(r => r.ratingFairness)),
        comm:      avg(reviews.map(r => r.ratingComm)),
        stability: avg(reviews.map(r => r.ratingStability)),
    } : null;

    const healthScore = Math.round(
        0.5 * league.stabilityScore +
        0.3 * league.activityScore  +
        0.2 * (commissioner.avgRating * 20)
    );
    const healthLabel = healthScore >= 80 ? 'Excellent' :
                        healthScore >= 65 ? 'Good'      :
                        healthScore >= 50 ? 'Fair'       :
                                           'Developing';

    // League Overlap: find other leagues that this league's reviewers also play in
    const reviewerIds = reviews.map(r => r.reviewerId).filter(Boolean) as string[];
    const overlapLeagues: { id: string; name: string; count: number }[] = [];
    if (reviewerIds.length > 0) {
        const grouped = await prisma.lFReview.groupBy({
            by:      ['leagueId'],
            where:   { reviewerId: { in: reviewerIds }, leagueId: { not: id } },
            _count:  { reviewerId: true },
            orderBy: { _count: { reviewerId: 'desc' } },
            take:    5,
        });
        if (grouped.length > 0) {
            const overlapIds    = grouped.map(g => g.leagueId);
            const overlapNames  = await prisma.lFLeague.findMany({
                where:  { id: { in: overlapIds } },
                select: { id: true, name: true },
            });
            const nameMap = new Map(overlapNames.map(l => [l.id, l.name]));
            for (const g of grouped) {
                const name = nameMap.get(g.leagueId);
                if (name) overlapLeagues.push({ id: g.leagueId, name, count: g._count.reviewerId });
            }
        }
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

                {/* ── Breadcrumb ──────────────────────────────────────── */}
                <nav className="text-xs text-gray-600 flex items-center gap-1.5">
                    <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                    <span>/</span>
                    <span className="text-white">{league.name}</span>
                </nav>

                {/* ── League header ───────────────────────────────────── */}
                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <h1 className="text-2xl font-bold text-white">{league.name}</h1>
                        {/* Health Score badge */}
                        <div
                            className={`flex flex-col items-center rounded-xl px-4 py-2 border ${
                                healthScore >= 80 ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400' :
                                healthScore >= 65 ? 'bg-[#D4AF37]/10  border-[#D4AF37]/30 text-[#D4AF37]' :
                                healthScore >= 50 ? 'bg-gray-800      border-gray-700     text-gray-300'   :
                                                   'bg-gray-800/50   border-gray-800     text-gray-500'
                            }`}
                            title="League Health = 50% Stability + 30% Activity + 20% Commissioner Rating"
                        >
                            <div className="text-[9px] uppercase tracking-wider font-bold opacity-70">League Health</div>
                            <div className="text-xl font-black tabular-nums">{healthScore}</div>
                            <div className="text-[9px] font-bold">{healthLabel}</div>
                        </div>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-2">
                        <Badge color="sky">{league.platform}</Badge>
                        <Badge color="purple">{league.format}</Badge>
                        <Badge color="gold">{league.scoring}</Badge>
                        <Badge color="gray">{league.size}-team</Badge>
                        {league.buyIn != null && league.buyIn > 0 && (
                            <Badge color="emerald">${league.buyIn} buy-in</Badge>
                        )}
                    </div>

                    {/* Score pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatBox
                            label="Stability" value={league.stabilityScore} color="gold"
                            tooltip={`${league.completedSeasons} completed season${league.completedSeasons !== 1 ? 's' : ''} with payouts`}
                        />
                        <StatBox
                            label="Activity" value={league.activityScore} color="gold"
                            tooltip={ACTIVITY_LABELS[league.activityScore] ?? 'Unrated'}
                        />
                        <StatBox label="Reviews" value={reviews.length} color="gray" />
                        {league.buyIn != null && (
                            <StatBox label="Buy-in" value={`$${league.buyIn}`} color="emerald" />
                        )}
                    </div>

                    {/* Avg sub-ratings */}
                    {avgRatings && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-800">
                            <SubRatingBlock label="Overall"       value={avgRatings.overall}   />
                            <SubRatingBlock label="Fairness"      value={avgRatings.fairness}  />
                            <SubRatingBlock label="Communication" value={avgRatings.comm}      />
                            <SubRatingBlock label="Stability"     value={avgRatings.stability} />
                        </div>
                    )}

                    {/* Payout structure */}
                    {league.payoutStructure && (
                        <div className="pt-2 border-t border-gray-800">
                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Payout Structure</div>
                            <pre className="text-xs text-gray-400 bg-gray-800/50 rounded-lg p-3 overflow-x-auto">
                                {JSON.stringify(league.payoutStructure, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>

                {/* ── Join / Manage ───────────────────────────────────── */}
                {isOwner ? (
                    <Link
                        href={`/leaguefinder/leagues/${id}/manage`}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-bold text-sm border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition"
                    >
                        ⚙️ Manage Waitlist & Seasons
                    </Link>
                ) : session?.user ? (
                    <JoinRequestButton
                        leagueId={id}
                        leagueName={league.name}
                        initialStatus={myStatus}
                    />
                ) : (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-center">
                        <p className="text-gray-500 text-sm">
                            <Link href="/sign-in" className="text-[#D4AF37] hover:underline">Sign in</Link>
                            {' '}to request to join this league.
                        </p>
                    </div>
                )}

                {/* ── Season History ───────────────────────────────────── */}
                {league.seasons.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Season History</h2>
                        <div className="space-y-2">
                            {league.seasons.map(s => (
                                <div key={s.id} className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-white">{s.year}</span>
                                        {s.champion && <span className="text-xs text-gray-400">🏆 {s.champion}</span>}
                                        {s.notes    && <span className="text-xs text-gray-600">{s.notes}</span>}
                                    </div>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                        s.payoutSent
                                            ? 'text-emerald-400 border-emerald-800 bg-emerald-900/20'
                                            : 'text-gray-600 border-gray-700'
                                    }`}>
                                        {s.payoutSent ? '✓ Paid out' : 'Payout pending'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── League Overlap ──────────────────────────────────── */}
                {overlapLeagues.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Members Also Play In</h2>
                        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
                            <p className="text-[10px] text-gray-500 mb-3">
                                Players from this league also appear in these leagues
                            </p>
                            {overlapLeagues.map(l => (
                                <Link
                                    key={l.id}
                                    href={`/leaguefinder/leagues/${l.id}`}
                                    className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 px-3 py-2 hover:border-gray-700 transition"
                                >
                                    <span className="text-sm font-semibold text-white">{l.name}</span>
                                    <span className="text-[10px] text-[#D4AF37] font-bold shrink-0 ml-3">
                                        {l.count} member{l.count !== 1 ? 's' : ''} in common
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Commissioner ────────────────────────────────────── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Commissioner</h2>
                    <CommissionerCard
                        id={commissioner.id}
                        displayName={commissioner.displayName}
                        avgRating={commissioner.avgRating}
                        reviewsCount={commissioner.reviewsCount}
                        flagsCount={commissioner.flagsCount}
                        platformHandles={handles}
                    />
                </section>

                {/* ── Reviews ─────────────────────────────────────────── */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                            Reviews ({reviews.length})
                        </h2>
                        {reviews.length > 0 && (
                            <RatingLabel
                                avg={avgRatings?.overall ?? 0}
                                count={reviews.length}
                            />
                        )}
                    </div>

                    {reviews.length === 0 ? (
                        <p className="text-gray-600 text-sm">No reviews yet. Be the first!</p>
                    ) : (
                        <div className="space-y-3">
                            {reviews.map(r => (
                                <div key={r.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <Link
                                                href={`/leaguefinder/users/${r.reviewer?.id ?? ''}`}
                                                className="text-xs font-semibold text-white hover:text-[#D4AF37] transition"
                                            >
                                                {r.reviewer?.name ?? 'Anonymous'}
                                            </Link>
                                            {r.verified ? (
                                                <span className="text-[10px] text-emerald-500 ml-2">
                                                    Played in this league · {r.seasonYear} season
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-gray-600 ml-2">{r.seasonYear} season</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <StarRating rating={r.ratingOverall} />
                                            {r.verified && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-emerald-900/30 text-emerald-400 border-emerald-800">Verified</span>}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                                        <SubRatingRow label="Fairness"  value={r.ratingFairness} />
                                        <SubRatingRow label="Comms"     value={r.ratingComm} />
                                        <SubRatingRow label="Stability" value={r.ratingStability} />
                                    </div>
                                    {r.text && (
                                        <p className="text-sm text-gray-400 leading-relaxed">{r.text}</p>
                                    )}
                                    {userId && userId !== r.reviewerId && (
                                        <ReviewVoteButtons
                                            reviewId={r.id}
                                            helpfulCount={r.helpfulCount}
                                            notHelpfulCount={r.notHelpfulCount}
                                            myVote={r.votes[0]?.helpful}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Leave a review ──────────────────────────────────── */}
                {session?.user ? (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Leave a Review</h2>
                        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                            <ReviewForm leagueId={league.id} commissionerId={commissioner.id} />
                        </div>
                    </section>
                ) : (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 text-center">
                        <p className="text-gray-500 text-sm">
                            <Link href="/sign-in" className="text-[#D4AF37] hover:underline">Sign in</Link>
                            {' '}to leave a review.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<number, string> = {
    20:  'Very low activity',
    40:  'Low activity',
    60:  'Moderate activity',
    80:  'High activity',
    100: 'Very high activity',
};

function avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function Badge({ children, color }: { children: React.ReactNode; color: 'sky' | 'purple' | 'gold' | 'gray' | 'emerald' }) {
    const styles = {
        sky:     'bg-sky-900/30     text-sky-400     border-sky-800',
        purple:  'bg-purple-900/30  text-purple-400  border-purple-800',
        gold:    'bg-[#D4AF37]/10   text-[#D4AF37]   border-[#D4AF37]/30',
        gray:    'bg-gray-800       text-gray-400    border-gray-700',
        emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
    };
    return (
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded border ${styles[color]}`}>
            {children}
        </span>
    );
}

function StatBox({ label, value, color, tooltip }: { label: string; value: number | string; color: 'gold' | 'gray' | 'emerald'; tooltip?: string }) {
    const styles = {
        gold:    'text-[#D4AF37]',
        gray:    'text-white',
        emerald: 'text-emerald-400',
    };
    return (
        <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 px-3 py-2.5 text-center cursor-help" title={tooltip}>
            <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
            <div className={`text-lg font-bold mt-0.5 ${styles[color]}`}>{value}</div>
        </div>
    );
}

function SubRatingBlock({ label, value }: { label: string; value: number }) {
    return (
        <div className="text-center">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-0.5">{label}</div>
            <StarRating rating={value} size="md" />
            <div className="text-xs text-gray-400 mt-0.5">{value.toFixed(1)}</div>
        </div>
    );
}

function SubRatingRow({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-600 w-12 shrink-0">{label}</span>
            <StarRating rating={value} />
        </div>
    );
}
