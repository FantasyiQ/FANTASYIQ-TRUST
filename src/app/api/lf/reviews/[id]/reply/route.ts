import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// POST — commissioner adds/updates a reply
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
    const userId = session.user.id;

    const review = await prisma.lFReview.findUnique({
        where:   { id: reviewId },
        include: { commissioner: { select: { id: true, ownerId: true } } },
    });
    if (!review) return Response.json({ error: 'Review not found' }, { status: 404 });
    if (review.commissioner.ownerId !== userId) {
        return Response.json({ error: 'Only the commissioner can reply' }, { status: 403 });
    }
    if (!review.commissioner.ownerId) {
        return Response.json({ error: 'Profile must be claimed to reply' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { text } = body as Record<string, unknown>;
    if (typeof text !== 'string' || !text.trim()) {
        return Response.json({ error: 'text is required' }, { status: 400 });
    }

    const reply = await prisma.lFReviewReply.upsert({
        where:  { reviewId },
        create: {
            reviewId,
            commissionerId: review.commissionerId,
            ownerId:        userId,
            text:           text.trim(),
        },
        update: { text: text.trim() },
    });

    return Response.json(reply, { status: 200 });
}

// DELETE — remove reply
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: reviewId } = await params;

    const reply = await prisma.lFReviewReply.findUnique({ where: { reviewId } });
    if (!reply) return Response.json({ error: 'Not found' }, { status: 404 });
    if (reply.ownerId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.lFReviewReply.delete({ where: { reviewId } });
    return new Response(null, { status: 204 });
}
