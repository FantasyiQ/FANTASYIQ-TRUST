import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeRookieFiQTier } from '@/lib/dynasty/rookieRankings';

async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) return null;
    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { isAdmin: true },
    });
    return user?.isAdmin ? session.user.id : null;
}

export async function PATCH(req: NextRequest) {
    if (!await requireAdmin()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id, fiqScore } = await req.json() as { id: string; fiqScore: number };

    if (!id || typeof fiqScore !== 'number' || fiqScore < 0 || fiqScore > 100) {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const existing = await prisma.rookieRankingsPlayer.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const fiqTier = computeRookieFiQTier(fiqScore);

    // Set baseFiQScore = fiqScore so the nightly cron uses this as the new base.
    // If opportunityScore is non-zero, the cron will blend it in: baseFiQ*0.75 + opp*0.25.
    const updated = await prisma.rookieRankingsPlayer.update({
        where: { id },
        data:  { baseFiQScore: fiqScore, fiqScore, fiqTier },
    });

    return NextResponse.json({ id: updated.id, baseFiQScore: updated.baseFiQScore, fiqScore: updated.fiqScore, fiqTier: updated.fiqTier });
}
