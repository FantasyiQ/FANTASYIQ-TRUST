export const dynamic = 'force-dynamic';

import { notFound }  from 'next/navigation';
import { auth }      from '@/lib/auth';
import { prisma }    from '@/lib/prisma';
import { Prisma }    from '@prisma/client';
import Link          from 'next/link';
import { RatingLabel, StarRating } from '@/components/leaguefinder/StarRating';
import ReviewFormWrapper  from './_ReviewFormWrapper';
import ReviewVoteButtons from '@/components/leaguefinder/ReviewVoteButtons';
import ReviewReplyForm   from '@/components/leaguefinder/ReviewReplyForm';

type ReviewRow = Prisma.LFReviewGetPayload<{
    include: {
        reviewer: { select: { id: true; name: true } };
        league:   { select: { id: true; name: true; format: true; scoring: true } };
        votes:    { select: { helpful: true } };
        reply:    true;
    };
}>;

export default async function CommissionerProfilePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id }  = await params;
    const session = await auth();
    const userId  = session?.user?.id;

    const commissioner = await prisma.lFCommissioner.findUnique({
        where:   { id },
        include: {
            leagues: {
                orderBy: { createdAt: 'asc' },
                include: {
                    _count:  { select: { reviews: true, joinRequests: true } },
                    seasons: { orderBy: { year: 'desc' } },
                },
            },
            reviews: {
                orderBy: [{ verified: 'desc' }, { helpfulCount: 'desc' }, { seasonYear: 'desc' }],
                take:    20,
                include: {
                    reviewer: { select: { id: true, name: true } },
                    league:   { select: { id: true, name: true, format: true, scoring: true } },
                    votes:    { where: { voterId: userId ?? '__none__' }, select: { helpful: true } },
                    reply:    true,
                },
            },
        },
    });

    if (!commissioner) notFound();

    const isOwner = userId === commissioner.ownerId;

    const handles = Object.entries(
        (commissioner.platformHandles ?? {}) as Record<string, string>
    ).filter(([, v]) => v);

    const reviews = commissioner.reviews as ReviewRow[];

    // ── Computed stats ────────────────────────────────────────────────────────
    const totalSeasons  = commissioner.leagues.reduce((s, l) => s + l.completedSeasons, 0);
    const maxStability  = commissioner.leagues.reduce((m, l) => Math.max(m, l.stabilityScore), 0);
    const maxActivity   = commissioner.leagues.reduce((m, l) => Math.max(m, l.activityScore), 0);

    const avgFairness = reviews.length > 0
        ? reviews.reduce((s, r) => s + r.ratingFairness, 0) / reviews.length : 0;
    const avgComm = reviews.length > 0
        ? reviews.reduce((s, r) => s + r.ratingComm, 0) / reviews.length : 0;

    // ── Highlights ────────────────────────────────────────────────────────────
    const highlights: { icon: string; label: string }[] = [];
    if (maxStability >= 60)                    highlights.push({ icon: '💰', label: 'Pays out on time' });
    if (reviews.length >= 3 && avgFairness >= 4.5) highlights.push({ icon: '⚖️', label: 'Fair and consistent rulings' });
    if (reviews.length >= 3 && avgComm >= 4.5)     highlights.push({ icon: '📣', label: 'Responsive commissioner' });
    if (maxActivity >= 60)                     highlights.push({ icon: '🔥', label: 'High activity league' });

    // ── Badges ────────────────────────────────────────────────────────────────
    const badges: { label: string; color: string }[] = [];
    if (totalSeasons >= 5)                         badges.push({ label: 'Veteran Commissioner', color: 'gold' });
    if (maxActivity >= 80)                         badges.push({ label: 'High Activity League', color: 'sky' });
    if (reviews.length >= 3 && avgFairness >= 4.5) badges.push({ label: 'Fair Play Certified',  color: 'emerald' });
    if (maxStability >= 60)                        badges.push({ label: 'Trusted Payouts',       color: 'purple' });

    // ── Red flags ─────────────────────────────────────────────────────────────
    const latePayouts   = reviews.filter(r => r.ratingStability <= 2).length;
    const unfairRulings = reviews.filter(r => r.ratingFairness  <= 2).length;
    const poorComms     = reviews.filter(r => r.ratingComm      <= 2).length;
    const flags = [
        latePayouts   > 0 && { label: 'late/missing payouts',           count: latePayouts },
        unfairRulings > 0 && { label: 'unfair rulings or rule changes', count: unfairRulings },
        poorComms     > 0 && { label: 'poor communication',             count: poorComms },
    ].filter(Boolean) as { label: string; count: number }[];

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

                {/* ── Breadcrumb ──────────────────────────────────────── */}
                <nav className="text-xs text-gray-600 flex items-center gap-1.5">
                    <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                    <span>/</span>
                    <span className="text-gray-400">Commissioners</span>
                    <span>/</span>
                    <span className="text-white">{commissioner.displayName}</span>
                </nav>

                {/* ── Profile header ─────────────────────────────────── */}
                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-2xl font-bold text-white">{commissioner.displayName}</h1>
                                {commissioner.claimed && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-900/20 text-emerald-400 border-emerald-800">
                                        ✓ Claimed
                                    </span>
                                )}
                            </div>
                            <div className="mt-2">
                                <RatingLabel avg={commissioner.avgRating} count={commissioner.reviewsCount} />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {commissioner.flagsCount > 0 && (
                                <span className="text-sm font-bold px-3 py-1 rounded-full border bg-red-900/30 text-red-400 border-red-800">
                                    {commissioner.flagsCount} flag{commissioner.flagsCount !== 1 ? 's' : ''}
                                </span>
                            )}
                            {commissioner.ownerId && (
                                <Link
                                    href={`/leaguefinder/users/${commissioner.ownerId}`}
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200 transition"
                                >
                                    Player Profile →
                                </Link>
                            )}
                            {isOwner && (
                                <Link
                                    href={`/leaguefinder/commissioners/${id}/edit`}
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition"
                                >
                                    ✏️ Edit Profile
                                </Link>
                            )}
                            {!commissioner.claimed && session?.user && (
                                <Link
                                    href={`/leaguefinder/commissioners/${id}/claim`}
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-[#D4AF37]/40 hover:text-[#D4AF37] transition"
                                >
                                    Claim This Profile
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-3">
                        <StatBox label="Avg Rating"    value={commissioner.avgRating.toFixed(1)} />
                        <StatBox label="Reviews"       value={String(commissioner.reviewsCount)} />
                        <StatBox label="Total Seasons" value={String(totalSeasons)} />
                    </div>

                    {/* Badges */}
                    {badges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {badges.map(b => (
                                <BadgePill key={b.label} color={b.color as BadgeColor}>{b.label}</BadgePill>
                            ))}
                        </div>
                    )}

                    {/* Platform handles */}
                    {handles.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {handles.map(([platform, handle]) => (
                                <span key={platform} className="text-xs px-2.5 py-1 rounded-full border bg-gray-800 border-gray-700 text-gray-300">
                                    <span className="text-gray-500">{platform}:</span> {handle}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Highlights ─────────────────────────────────────── */}
                {highlights.length > 0 && (
                    <section className="space-y-2">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Highlights</h2>
                        <div className="grid grid-cols-2 gap-2">
                            {highlights.map(h => (
                                <div key={h.label} className="flex items-center gap-2 rounded-lg border border-emerald-900/40 bg-emerald-900/10 px-3 py-2">
                                    <span className="text-base">{h.icon}</span>
                                    <span className="text-xs text-emerald-300 font-medium">{h.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Red flags ──────────────────────────────────────── */}
                {flags.length > 0 && (
                    <section className="space-y-2">
                        <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider">⚠️ Reports</h2>
                        <div className="rounded-xl border border-red-900/50 bg-red-900/10 px-4 py-3 space-y-1.5">
                            {flags.map(f => (
                                <div key={f.label} className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-red-400 tabular-nums">{f.count}</span>
                                    <span className="text-xs text-red-300">{f.label}</span>
                                </div>
                            ))}
                            <p className="text-[10px] text-red-600 pt-1">Based on community reviews. Not independently verified.</p>
                        </div>
                    </section>
                )}

                {/* ── Timeline ───────────────────────────────────────── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Commissioner Timeline</h2>
                    {commissioner.leagues.length === 0 ? (
                        <p className="text-gray-600 text-sm">No leagues listed yet.</p>
                    ) : (
                        <div className="relative pl-4 border-l border-gray-800 space-y-4">
                            {commissioner.leagues.map(league => (
                                <div key={league.id} className="relative">
                                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-gray-700 border-2 border-gray-900" />
                                    <div className="text-[10px] text-gray-600 mb-0.5">
                                        {new Date(league.createdAt).getFullYear()} · {league.completedSeasons} season{league.completedSeasons !== 1 ? 's' : ''} completed
                                    </div>
                                    <Link
                                        href={`/leaguefinder/leagues/${league.id}`}
                                        className="text-sm font-semibold text-white hover:text-[#D4AF37] transition"
                                    >
                                        {league.name}
                                    </Link>
                                    <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                                        <MicroBadge>{league.platform}</MicroBadge>
                                        <MicroBadge>{league.format}</MicroBadge>
                                        <MicroBadge>{league.size}-team</MicroBadge>
                                        {league.stabilityScore >= 60 && (
                                            <span className="text-[9px] text-emerald-500">✓ Stable</span>
                                        )}
                                        {league.activityScore >= 60 && (
                                            <span className="text-[9px] text-sky-500">⚡ Active</span>
                                        )}
                                        <span className="text-[9px] text-gray-600">
                                            {league._count.reviews} review{league._count.reviews !== 1 ? 's' : ''}
                                        </span>
                                        {isOwner && league._count.joinRequests > 0 && (
                                            <Link
                                                href={`/leaguefinder/leagues/${league.id}/manage`}
                                                className="text-[9px] font-bold text-[#D4AF37] hover:underline"
                                            >
                                                {league._count.joinRequests} request{league._count.joinRequests !== 1 ? 's' : ''}
                                            </Link>
                                        )}
                                        {isOwner && league._count.joinRequests === 0 && (
                                            <Link
                                                href={`/leaguefinder/leagues/${league.id}/manage`}
                                                className="text-[9px] text-gray-700 hover:text-gray-500 transition"
                                            >
                                                Manage
                                            </Link>
                                        )}
                                    </div>
                                    {/* Season history pills */}
                                    {'seasons' in league && (league as { seasons: { year: number; payoutSent: boolean; champion: string | null }[] }).seasons.length > 0 && (
                                        <div className="flex gap-1 flex-wrap mt-1.5">
                                            {(league as { seasons: { year: number; payoutSent: boolean; champion: string | null }[] }).seasons.slice(0, 5).map(s => (
                                                <span
                                                    key={s.year}
                                                    title={s.champion ? `🏆 ${s.champion}` : undefined}
                                                    className={`text-[8px] px-1.5 py-0.5 rounded border ${
                                                        s.payoutSent
                                                            ? 'text-emerald-500 border-emerald-900 bg-emerald-900/10'
                                                            : 'text-gray-600 border-gray-800'
                                                    }`}
                                                >
                                                    {s.year}{s.payoutSent ? ' ✓' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Reviews ────────────────────────────────────────── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Reviews</h2>
                    {reviews.length === 0 ? (
                        <p className="text-gray-600 text-sm">No reviews yet. Be the first to review.</p>
                    ) : (
                        <div className="space-y-3">
                            {reviews.map(r => (
                                <ReviewCard
                                    key={r.id}
                                    review={r}
                                    showVoting={!!userId && userId !== r.reviewerId}
                                    isOwner={isOwner}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Leave a review ─────────────────────────────────── */}
                {session?.user && commissioner.leagues.length > 0 && (
                    <ReviewFormWrapper
                        commissionerId={commissioner.id}
                        leagues={commissioner.leagues.map(l => ({
                            id:   l.id,
                            name: l.name,
                        }))}
                    />
                )}
                {!session?.user && (
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 px-3 py-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
            <div className="text-lg font-bold text-white mt-0.5">{value}</div>
        </div>
    );
}

function MicroBadge({ children }: { children: React.ReactNode }) {
    return (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-gray-800 border-gray-700 text-gray-400">
            {children}
        </span>
    );
}

type BadgeColor = 'gold' | 'sky' | 'emerald' | 'purple';

function BadgePill({ children, color }: { children: React.ReactNode; color: BadgeColor }) {
    const styles: Record<BadgeColor, string> = {
        gold:    'bg-[#D4AF37]/10 text-[#D4AF37]  border-[#D4AF37]/30',
        sky:     'bg-sky-900/20  text-sky-400     border-sky-800',
        emerald: 'bg-emerald-900/20 text-emerald-400 border-emerald-800',
        purple:  'bg-purple-900/20 text-purple-400  border-purple-800',
    };
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${styles[color]}`}>
            {children}
        </span>
    );
}

function ReviewCard({ review, showVoting, isOwner }: { review: ReviewRow; showVoting: boolean; isOwner: boolean }) {
    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link
                        href={`/leaguefinder/users/${review.reviewer?.id ?? ''}`}
                        className="text-xs font-semibold text-white hover:text-[#D4AF37] transition"
                    >
                        {review.reviewer?.name ?? 'Anonymous'}
                    </Link>
                    {review.verified ? (
                        <span className="text-[10px] text-emerald-500 ml-2">
                            Played in this league · {review.seasonYear} season
                        </span>
                    ) : (
                        <span className="text-[10px] text-gray-600 ml-2">{review.seasonYear} season</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <StarRating rating={review.ratingOverall} />
                    {review.verified && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-emerald-900/30 text-emerald-400 border-emerald-800">Verified</span>}
                    {review.disputed && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-yellow-900/30 text-yellow-400 border-yellow-800">Disputed</span>}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                <SubRating label="Fairness"  value={review.ratingFairness} />
                <SubRating label="Comms"     value={review.ratingComm} />
                <SubRating label="Stability" value={review.ratingStability} />
            </div>

            {review.text && (
                <p className="text-sm text-gray-400 leading-relaxed">{review.text}</p>
            )}

            <div className="text-[10px] text-gray-700">
                League:{' '}
                <Link
                    href={`/leaguefinder/leagues/${review.league?.id ?? ''}`}
                    className="hover:text-gray-500 transition"
                >
                    {review.league?.name}
                </Link>
            </div>

            {/* Commissioner reply */}
            {review.reply && (
                <div className="mt-1 pl-3 border-l-2 border-[#D4AF37]/30 space-y-1">
                    <p className="text-[10px] font-bold text-[#D4AF37]">Commissioner response</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{review.reply.text}</p>
                </div>
            )}
            {isOwner && (
                <ReviewReplyForm
                    reviewId={review.id}
                    existingReply={review.reply ? {
                        id:        review.reply.id,
                        text:      review.reply.text,
                        createdAt: review.reply.createdAt.toISOString(),
                    } : null}
                />
            )}
            {showVoting && !isOwner && (
                <ReviewVoteButtons
                    reviewId={review.id}
                    helpfulCount={review.helpfulCount}
                    notHelpfulCount={review.notHelpfulCount}
                    myVote={review.votes[0]?.helpful}
                />
            )}
        </div>
    );
}

function SubRating({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-600 w-12 shrink-0">{label}</span>
            <StarRating rating={value} />
        </div>
    );
}
