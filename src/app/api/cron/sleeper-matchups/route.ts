import { prisma } from '@/lib/prisma';
import { getLeagueMatchups, getNflState, isGameWindow } from '@/lib/sleeper';

export const maxDuration = 60;

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
        const uniqueLeagueIds = [...new Map(leagues.map((l) => [l.leagueId, l])).values()];

        let updated = 0;

        for (const league of uniqueLeagueIds) {
            try {
                const matchups = await getLeagueMatchups(league.leagueId, nflState.week);
                const active = matchups.filter((m) => m.matchup_id !== null);

                // Group into pairs by matchup_id
                const pairs = new Map<number, typeof active>();
                for (const m of active) {
                    const id = m.matchup_id!;
                    if (!pairs.has(id)) pairs.set(id, []);
                    pairs.get(id)!.push(m);
                }

                const matchupData = [...pairs.entries()].map(([id, teams]) => ({
                    matchupId: id,
                    week: nflState.week,
                    teams: teams.map((t) => ({
                        rosterId: t.roster_id,
                        points: t.custom_points ?? t.points,
                    })),
                }));

                // Update all DB rows for this leagueId
                await prisma.league.updateMany({
                    where: { leagueId: league.leagueId },
                    data: { currentMatchup: matchupData },
                });
                updated++;
            } catch { /* skip this league */ }
        }

        return Response.json({ ok: true, updated, week: nflState.week });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Matchup poll failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
