import { prisma } from '@/lib/prisma';
import { getLeagueMatchups, getNflState, isGameWindow } from '@/lib/sleeper';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only do real work during NFL game windows
    if (!isGameWindow()) return Response.json({ skipped: true, reason: 'outside game window' });

    try {
        const nflState = await getNflState();

        // Only poll during regular season and playoffs
        if (nflState.season_type === 'pre') {
            return Response.json({ skipped: true, reason: 'preseason' });
        }

        // Get all in-season leagues — deduplicate by leagueId to avoid redundant API calls
        const leagues = await prisma.league.findMany({
            where: { status: 'in_season' },
            select: { id: true, leagueId: true },
        });

        // Deduplicate: one Sleeper API call per unique leagueId
        const uniqueLeagues = [...new Map(leagues.map((l) => [l.leagueId, l])).values()];

        // ── Phase 1: fetch all Sleeper data before touching the DB ───────────
        // Keeping API calls and DB writes separate avoids holding a connection
        // open during slow network calls, which caused connection timeout errors.
        type MatchupPayload = { leagueId: string; data: object[] };
        const results = await Promise.allSettled(
            uniqueLeagues.map(async (league): Promise<MatchupPayload> => {
                const matchups = await getLeagueMatchups(league.leagueId, nflState.week);
                const active   = matchups.filter((m) => m.matchup_id !== null);

                const pairs = new Map<number, typeof active>();
                for (const m of active) {
                    const id = m.matchup_id!;
                    if (!pairs.has(id)) pairs.set(id, []);
                    pairs.get(id)!.push(m);
                }

                return {
                    leagueId: league.leagueId,
                    data: [...pairs.entries()].map(([id, teams]) => ({
                        matchupId: id,
                        week:      nflState.week,
                        teams:     teams.map((t) => ({
                            rosterId: t.roster_id,
                            points:   t.custom_points ?? t.points,
                        })),
                    })),
                };
            })
        );

        const payloads = results
            .filter((r): r is PromiseFulfilledResult<MatchupPayload> => r.status === 'fulfilled')
            .map((r) => r.value);

        // ── Phase 2: batch all DB writes in a single transaction ─────────────
        // One transaction replaces N sequential updateMany calls, eliminating
        // the N+1 query pattern Sentry flagged on this route.
        await prisma.$transaction(
            payloads.map(({ leagueId, data }) =>
                prisma.league.updateMany({
                    where: { leagueId },
                    data:  { currentMatchup: data },
                })
            )
        );

        return Response.json({ ok: true, updated: payloads.length, week: nflState.week });
    } catch (err) {
        captureError(err, { cron: 'sleeper-matchups' });
        const message = err instanceof Error ? err.message : 'Matchup poll failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
