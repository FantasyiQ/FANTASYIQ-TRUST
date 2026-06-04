// GET /api/draft-assistant?leagueId=...&sleeperDraftId=...&myRosterId=...
// Returns ranked draft recommendations for the current pick in a live Sleeper draft.

import { type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requireLeaguePaidAccess } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { loadDraftContext } from '@/lib/draft/contextLoader';
import { rankCandidates, detectTradeDown } from '@/lib/draft/scoring';
import { getTrajectoryLabel } from '@/lib/draft/context';

export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const leagueId      = searchParams.get('leagueId');
    const sleeperDraftId = searchParams.get('sleeperDraftId');
    const myRosterId     = searchParams.get('myRosterId');

    if (!leagueId || !sleeperDraftId || !myRosterId) {
        return Response.json({ error: 'Missing params: leagueId, sleeperDraftId, myRosterId' }, { status: 400 });
    }

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id: leagueId },
            select: { userId: true, leagueId: true, assignedPlanId: true, assignedPlanType: true, sleeperUserId: true },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { sleeperUserId: true },
        }),
    ]);

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const deny = await requireLeaguePaidAccess(session.user.id, league.assignedPlanId, league.assignedPlanType);
    if (deny) return deny;

    // Server-side Sleeper user ID — prefer user-level, fall back to league-level.
    // This is used for authoritative owner_id binding in contextLoader so the correct
    // roster is always loaded regardless of what myRosterId the client sends.
    const sleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;

    const ctx = await loadDraftContext({
        leagueDbId:      leagueId,
        sleeperLeagueId: league.leagueId,
        sleeperDraftId,
        myRosterId,
        sleeperUserId,
    });

    const recommendations = rankCandidates(ctx);
    const tradeDownNote   = detectTradeDown(ctx);

    return Response.json({
        recommendations,
        tradeDownNote,
        meta: {
            currentPick:        ctx.draftMeta.currentPickOverall,
            currentRound:       ctx.draftMeta.currentRound,
            totalRounds:        ctx.draftMeta.totalRounds,
            draftType:          ctx.draftType,
            onTheClockRosterId: ctx.draftMeta.onTheClockRosterId,
            myPickCount:        ctx.myRoster.length,
            teamMode:           ctx.draftProfile.teamMode,
            trajectoryWindow:   ctx.draftProfile.trajectoryWindow,
            horizonYears:       ctx.draftProfile.horizonYears,
            riskTolerance:      ctx.draftProfile.riskTolerance,
            trajectoryLabel:    getTrajectoryLabel(ctx.draftProfile),
        },
    });
}
