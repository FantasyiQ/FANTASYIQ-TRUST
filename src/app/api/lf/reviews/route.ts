import { auth }      from '@/lib/auth';
import { prisma }    from '@/lib/prisma';
import { recalcPRS } from '@/lib/lf-prs';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function POST(request: Request) {

    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const {
        leagueId, commissionerId,
        ratingOverall, ratingFairness, ratingComm, ratingStability,
        text, seasonYear,
    } = body as Record<string, unknown>;

    const reviewerId = session.user.id;

    // Validate required fields
    if (typeof leagueId       !== 'string') return Response.json({ error: 'leagueId is required' },       { status: 400 });
    if (typeof commissionerId !== 'string') return Response.json({ error: 'commissionerId is required' }, { status: 400 });
    if (typeof seasonYear     !== 'number') return Response.json({ error: 'seasonYear is required' },     { status: 400 });
    if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
        return Response.json({ error: 'seasonYear must be a valid year.' }, { status: 400 });
    }
    if (typeof text === 'string' && text.length > 2000) {
        return Response.json({ error: 'Review text must be 2000 characters or fewer.' }, { status: 400 });
    }

    const validRating = (v: unknown): v is number =>
        typeof v === 'number' && v >= 1 && v <= 5 && Number.isInteger(v);

    if (!validRating(ratingOverall))   return Response.json({ error: 'ratingOverall must be 1-5' },   { status: 400 });
    if (!validRating(ratingFairness))  return Response.json({ error: 'ratingFairness must be 1-5' },  { status: 400 });
    if (!validRating(ratingComm))      return Response.json({ error: 'ratingComm must be 1-5' },      { status: 400 });
    if (!validRating(ratingStability)) return Response.json({ error: 'ratingStability must be 1-5' }, { status: 400 });

    // Verify league + commissioner exist and are linked
    const league = await prisma.lFLeague.findUnique({ where: { id: leagueId } });
    if (!league) return Response.json({ error: 'League not found' },       { status: 404 });
    if (league.commissionerId !== commissionerId) {
        return Response.json({ error: 'Commissioner does not match league' }, { status: 400 });
    }

    // Create review (unique constraint: one review per user per league per season)
    let review;
    try {
        review = await prisma.lFReview.create({
            data: {
                leagueId,
                commissionerId,
                reviewerId,
                ratingOverall,
                ratingFairness,
                ratingComm,
                ratingStability,
                text:       typeof text === 'string' ? text.trim() || null : null,
                seasonYear,
                verified:   false,
                disputed:   false,
            },
        });
    } catch (err: unknown) {
        // Unique constraint violation — already reviewed this league this season
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
            return Response.json({ error: 'You have already reviewed this league for that season' }, { status: 409 });
        }
        throw err;
    }

    // ── Recalculate commissioner stats ────────────────────────────────────────
    const allCommReviews = await prisma.lFReview.aggregate({
        where:   { commissionerId },
        _avg:    { ratingOverall: true },
        _count:  { id: true },
    });

    await prisma.lFCommissioner.update({
        where: { id: commissionerId },
        data:  {
            avgRating:    allCommReviews._avg.ratingOverall ?? 0,
            reviewsCount: allCommReviews._count.id,
        },
    });

    // Reward reviewer trust score for verified review
    if (review.verified) {
        await prisma.user.update({
            where: { id: reviewerId },
            data:  { trustScore: { increment: 5 } },
        });
    }

    // ── Recalculate league verified count + rankingScore ──────────────────────
    const verifiedCount = await prisma.lFReview.count({ where: { leagueId, verified: true } });
    const leagueData    = await prisma.lFLeague.findUnique({
        where:   { id: leagueId },
        include: { commissioner: { select: { avgRating: true } } },
    });
    if (leagueData) {
        const rankingScore = Math.round(
            0.40 * leagueData.stabilityScore +
            0.25 * leagueData.activityScore  +
            0.20 * (leagueData.commissioner.avgRating * 20) +
            0.15 * Math.min(100, verifiedCount * 20),
        );
        await prisma.lFLeague.update({
            where: { id: leagueId },
            data:  { verifiedReviewsCount: verifiedCount, rankingScore },
        });
    }

    // Recalculate PRS for the reviewer
    await recalcPRS(reviewerId);

    return Response.json(review, { status: 201 });
}
