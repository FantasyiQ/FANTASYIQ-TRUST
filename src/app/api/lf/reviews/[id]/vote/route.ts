import { auth }      from '@/lib/auth';
import { prisma }    from '@/lib/prisma';
import { calculateAndSavePrs } from '@/lib/prs';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: reviewId } = await params;
    const voterId = session.user.id;

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { helpful } = body as Record<string, unknown>;
    if (typeof helpful !== 'boolean') {
        return Response.json({ error: 'helpful must be a boolean' }, { status: 400 });
    }

    const review = await prisma.lFReview.findUnique({ where: { id: reviewId } });
    if (!review) return Response.json({ error: 'Review not found' }, { status: 404 });

    // Can't vote on your own review
    if (review.reviewerId === voterId) {
        return Response.json({ error: 'Cannot vote on your own review' }, { status: 403 });
    }

    const existing = await prisma.lFReviewVote.findUnique({
        where: { reviewId_voterId: { reviewId, voterId } },
    });

    if (existing && existing.helpful === helpful) {
        // Toggle off — delete the vote
        await prisma.lFReviewVote.delete({ where: { id: existing.id } });
    } else if (existing) {
        // Switch vote
        await prisma.lFReviewVote.update({
            where: { id: existing.id },
            data:  { helpful },
        });
    } else {
        // New vote
        await prisma.lFReviewVote.create({ data: { reviewId, voterId, helpful } });
    }

    // Recalculate counts
    const [helpfulAgg, notHelpfulAgg] = await Promise.all([
        prisma.lFReviewVote.count({ where: { reviewId, helpful: true } }),
        prisma.lFReviewVote.count({ where: { reviewId, helpful: false } }),
    ]);

    const updated = await prisma.lFReview.update({
        where: { id: reviewId },
        data:  { helpfulCount: helpfulAgg, notHelpfulCount: notHelpfulAgg },
        select: { helpfulCount: true, notHelpfulCount: true },
    });

    // Award trust score to reviewer for helpful votes
    if (helpful && !existing) {
        await prisma.user.update({
            where: { id: review.reviewerId },
            data:  { trustScore: { increment: 1 } },
        });
    }

    // Recalculate unified PRS for the review's author
    await calculateAndSavePrs(review.reviewerId);

    return Response.json(updated);
}
