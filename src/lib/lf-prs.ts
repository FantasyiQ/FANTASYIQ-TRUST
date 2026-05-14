import { prisma } from '@/lib/prisma';
export { prsTier, PRS_TIER_LABELS, PRS_TIER_STYLES } from '@/lib/lf-prs-display';
export type { PRSTier } from '@/lib/lf-prs-display';

/**
 * Player Reliability Score (PRS) — 0 to 100
 *
 * Measures how trustworthy a user is as a league member.
 *
 * Component breakdown (max 100 pts):
 *   Verified seasons    — 8 pts each,  max 40  (proves actual participation)
 *   League retention    — 5 pts each,  max 25  (leagues with 2+ reviews = stayed multiple seasons)
 *   Helpful vote score  — 2 pts each,  max 20  (community says their reviews are quality)
 *   Accepted requests   — 3 pts each,  max 15  (commissioners have vouched for them)
 */

export interface PRSBreakdown {
    total:            number;
    verifiedSeasons:  number;  // raw count
    returnedLeagues:  number;  // raw count
    totalHelpful:     number;  // raw count
    acceptedRequests: number;  // raw count
    pts: {
        verified:  number;
        retention: number;
        helpful:   number;
        accepted:  number;
    };
}

export function computePRS(
    verifiedSeasons:  number,
    returnedLeagues:  number,
    totalHelpful:     number,
    acceptedRequests: number,
): PRSBreakdown {
    const pts = {
        verified:  Math.min(40, verifiedSeasons  * 8),
        retention: Math.min(25, returnedLeagues  * 5),
        helpful:   Math.min(20, totalHelpful     * 2),
        accepted:  Math.min(15, acceptedRequests * 3),
    };
    const total = Math.min(100, pts.verified + pts.retention + pts.helpful + pts.accepted);
    return { total, verifiedSeasons, returnedLeagues, totalHelpful, acceptedRequests, pts };
}

/** Fetch the inputs, compute PRS, persist it, and return the breakdown. */
export async function recalcPRS(userId: string): Promise<PRSBreakdown> {
    const user = await prisma.user.findUnique({
        where:   { id: userId },
        select: {
            lfReviews: {
                select: { verified: true, leagueId: true, helpfulCount: true },
            },
            lfJoinRequests: {
                where:  { status: 'ACCEPTED' },
                select: { id: true },
            },
        },
    });

    if (!user) {
        const empty = computePRS(0, 0, 0, 0);
        return empty;
    }

    const reviews          = user.lfReviews;
    const verifiedSeasons  = reviews.filter(r => r.verified).length;

    // Leagues where the user has reviewed 2+ different seasons (returned member)
    const leagueReviewCounts = new Map<string, number>();
    for (const r of reviews) {
        leagueReviewCounts.set(r.leagueId, (leagueReviewCounts.get(r.leagueId) ?? 0) + 1);
    }
    const returnedLeagues  = Array.from(leagueReviewCounts.values()).filter(c => c >= 2).length;

    const totalHelpful     = reviews.reduce((sum, r) => sum + r.helpfulCount, 0);
    const acceptedRequests = user.lfJoinRequests.length;

    const breakdown = computePRS(verifiedSeasons, returnedLeagues, totalHelpful, acceptedRequests);

    await prisma.user.update({
        where: { id: userId },
        data:  { prsScore: breakdown.total },
    });

    return breakdown;
}

