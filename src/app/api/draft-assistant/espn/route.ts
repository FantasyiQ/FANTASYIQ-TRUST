// GET /api/draft-assistant/espn?leagueId=...
// ESPN equivalent of /api/draft-assistant — returns live draft picks and the
// available-player pool for the Live Draft page's Draft Board + Available
// Players sections. No scored recommendations (unlike Sleeper) — see
// espnContextLoader.ts's header comment for why that's out of scope here.

import { type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requireLeaguePaidAccess } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { loadEspnDraftContext } from '@/lib/draft/espnContextLoader';

export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const leagueId = searchParams.get('leagueId');
    if (!leagueId) return Response.json({ error: 'Missing param: leagueId' }, { status: 400 });

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id: leagueId },
            select: { userId: true, leagueId: true, season: true, platform: true, assignedPlanId: true, assignedPlanType: true },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { espnS2: true, swid: true },
        }),
    ]);

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (league.platform !== 'espn') {
        return Response.json({ error: 'This league is not an ESPN league' }, { status: 400 });
    }

    const deny = await requireLeaguePaidAccess(session.user.id, league.assignedPlanId, league.assignedPlanType);
    if (deny) return deny;

    if (!dbUser?.espnS2 || !dbUser?.swid) {
        return Response.json({ error: 'ESPN not connected. Go to Settings → Sync → ESPN to reconnect.' }, { status: 401 });
    }

    const ctx = await loadEspnDraftContext({
        espnLeagueId: league.leagueId,
        season:       Number(league.season),
        espnS2:       dbUser.espnS2,
        swid:         dbUser.swid,
    });

    if (ctx.dataSource === 'unavailable') {
        return Response.json({
            error:            ctx.error ?? "Couldn't load ESPN draft data right now.",
            availablePlayers: [],
            picksSoFar:       [],
            rosterOptions:    [],
            meta:             null,
        }, { status: 502 });
    }

    return Response.json({
        availablePlayers: ctx.availablePlayers,
        picksSoFar:       ctx.picksSoFar,
        rosterOptions:    ctx.rosterOptions,
        meta: {
            currentPick:        ctx.draftMeta.currentPickOverall,
            currentRound:       ctx.draftMeta.currentRound,
            totalRounds:        ctx.draftMeta.totalRounds,
            onTheClockRosterId: ctx.draftMeta.onTheClockTeamId,
        },
    });
}
