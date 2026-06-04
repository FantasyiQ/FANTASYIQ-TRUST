// GET /api/cron/prs-lineups
// Weekly cron (Tuesdays 6am UTC) — checks whether each manager set their lineup
// for the current NFL week. Writes lineup_set or lineup_missed PrsEvents.
//
// Why Tuesdays: all games (Sun/Mon/Thu) are complete by Monday midnight ET.
// Running at 6am UTC Tuesday (2am ET) gives a comfortable buffer after Monday Night.
//
// Deduplication: sourceRef = "lineup:{leagueId}:{season}:week{N}:{rosterId}"
// Fully idempotent — safe to re-run if the cron fires twice.

import { prisma } from '@/lib/prisma';
import { getLeagueMatchups, getLeagueRosters, getNflState } from '@/lib/sleeper';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const nflState = await getNflState();

        if (nflState.season_type === 'pre') {
            return Response.json({ skipped: true, reason: 'preseason' });
        }

        const week   = nflState.week;
        const season = nflState.season;

        // Build sleeperUserId → FiQ userId lookup
        const sleeperUsers = await prisma.user.findMany({
            where:  { sleeperUserId: { not: null } },
            select: { id: true, sleeperUserId: true },
        });
        const sleeperToFiQ = new Map(sleeperUsers.map(u => [u.sleeperUserId!, u.id]));

        // Include complete leagues too — week N lineup check may fire while a league
        // just flipped to complete (championship week). in_season covers regular season.
        const leagues = await prisma.league.findMany({
            where:  { platform: 'sleeper', status: { in: ['in_season', 'complete'] } },
            select: { leagueId: true, season: true },
            distinct: ['leagueId'],
        });

        let lineupSet    = 0;
        let lineupMissed = 0;
        let leaguesFailed = 0;
        const now = new Date();

        for (const { leagueId, season: leagueSeason } of leagues) {
            try {
                const [rosters, matchups] = await Promise.all([
                    getLeagueRosters(leagueId),
                    getLeagueMatchups(leagueId, week),
                ]);

                const rosterToOwner = new Map(
                    rosters
                        .filter(r => r.owner_id != null)
                        .map(r => [r.roster_id, r.owner_id!])
                );

                type PrsRow = {
                    userId:    string;
                    eventType: 'lineup_set' | 'lineup_missed';
                    eventDate: Date;
                    sourceRef: string;
                };
                const rows: PrsRow[] = [];

                for (const matchup of matchups) {
                    if (matchup.matchup_id === null) continue; // bye week — no matchup

                    const sleeperOwnerId = rosterToOwner.get(matchup.roster_id);
                    if (!sleeperOwnerId) continue;

                    const fiQUserId = sleeperToFiQ.get(sleeperOwnerId);
                    if (!fiQUserId) continue;

                    // In Sleeper's API, "0" in the starters array means an empty slot.
                    // An entirely empty starters array also means no lineup was set.
                    const hasEmptySlot =
                        matchup.starters.length === 0 ||
                        matchup.starters.some(s => s === '0' || s === '');

                    rows.push({
                        userId:    fiQUserId,
                        eventType: hasEmptySlot ? 'lineup_missed' : 'lineup_set',
                        eventDate: now,
                        sourceRef: `lineup:${leagueId}:${leagueSeason ?? season}:week${week}:${matchup.roster_id}`,
                    });
                }

                if (rows.length > 0) {
                    await prisma.prsEvent.createMany({ data: rows, skipDuplicates: true });
                    lineupSet    += rows.filter(r => r.eventType === 'lineup_set').length;
                    lineupMissed += rows.filter(r => r.eventType === 'lineup_missed').length;
                }
            } catch (err) {
                captureError(err, { cron: 'prs-lineups', leagueId });
                leaguesFailed++;
            }
        }

        return Response.json({
            ok:           true,
            week,
            leagues:      leagues.length,
            lineupSet,
            lineupMissed,
            leaguesFailed,
        });
    } catch (err) {
        captureError(err, { cron: 'prs-lineups' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
