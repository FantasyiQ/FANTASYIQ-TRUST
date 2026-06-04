// GET /api/cron/dss-history
// Daily cron (5:30am UTC) — walks the previous_league_id chain for every
// dynasty league in the DB and backfills historical season standings so
// DSS can aggregate performance across multiple completed seasons.
//
// How it works:
//   1. For each user with Sleeper linked + at least one Dynasty league in DB
//   2. For each dynasty league, walk back up to MAX_HISTORY_DEPTH prior seasons
//      via Sleeper's previous_league_id field
//   3. For each historical season: fetch rosters → build standings JSON
//   4. Upsert a League row with isHistorical=true
//
// The dss-calculate cron reads ALL League rows (including historical) when
// computing DSS, so adding these rows immediately improves score accuracy.
//
// Idempotent: already-cached seasons are detected before making Sleeper API
// calls, so repeat runs are cheap.

import { prisma } from '@/lib/prisma';
import { getLeague, getLeagueRosters, rosterFpts } from '@/lib/sleeper';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

// How many seasons back to walk for each dynasty franchise.
// 6 covers 2019–2025 for a league in its 7th year.
const MAX_HISTORY_DEPTH = 6;

// Sleeper sometimes uses "0" as a null sentinel for previous_league_id
function isValidLeagueId(id: string | null | undefined): id is string {
    return !!id && id !== '0' && id.length > 4;
}

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get all users who have at least one dynasty league synced
        const users = await prisma.user.findMany({
            where: {
                sleeperUserId: { not: null },
                leagues: { some: { platform: 'sleeper', leagueType: 'Dynasty', isHistorical: false } },
            },
            select: {
                id: true,
                sleeperUserId: true,
                leagues: {
                    where:  { platform: 'sleeper', leagueType: 'Dynasty', isHistorical: false },
                    select: { leagueId: true, leagueName: true, totalRosters: true },
                },
            },
        });

        let seasonsBackfilled = 0;
        let seasonsSkipped    = 0;
        let usersFailed       = 0;

        for (const user of users) {
            try {
                for (const dbLeague of user.leagues) {
                    let currentLeagueId = dbLeague.leagueId;

                    for (let depth = 0; depth < MAX_HISTORY_DEPTH; depth++) {
                        // Fetch the Sleeper league to get previous_league_id + season
                        let sleeperLeague;
                        try {
                            sleeperLeague = await getLeague(currentLeagueId);
                        } catch {
                            break; // League no longer accessible on Sleeper — stop chain
                        }

                        const prevLeagueId = sleeperLeague.previous_league_id;
                        if (!isValidLeagueId(prevLeagueId)) break; // reached the beginning of the franchise

                        const historicalLeagueId = prevLeagueId;

                        // Skip if we've already cached this season for this user
                        const existing = await prisma.league.findFirst({
                            where:  { userId: user.id, platform: 'sleeper', leagueId: historicalLeagueId },
                            select: { id: true },
                        });
                        if (existing) {
                            seasonsSkipped++;
                            // Still walk further back — older seasons may not be cached yet
                            currentLeagueId = historicalLeagueId;
                            continue;
                        }

                        // Fetch the historical league details + rosters
                        let historicalLeague;
                        let rosters;
                        try {
                            [historicalLeague, rosters] = await Promise.all([
                                getLeague(historicalLeagueId),
                                getLeagueRosters(historicalLeagueId),
                            ]);
                        } catch {
                            break; // Historical data unavailable — stop chain
                        }

                        if (!Array.isArray(rosters) || rosters.length === 0) {
                            currentLeagueId = historicalLeagueId;
                            continue;
                        }

                        // Build standings in the same format as sleeper-sync
                        const standings = rosters
                            .filter(r => r.owner_id != null)
                            .map(r => ({
                                rosterId: r.roster_id,
                                ownerId:  r.owner_id!,
                                wins:     r.settings?.wins    ?? 0,
                                losses:   r.settings?.losses  ?? 0,
                                ties:     r.settings?.ties    ?? 0,
                                fpts:     rosterFpts(r.settings),
                            }))
                            .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);

                        // Only store if the season actually had games played
                        const totalGames = standings.reduce(
                            (sum, r) => sum + r.wins + r.losses + r.ties, 0
                        );
                        if (totalGames === 0) {
                            currentLeagueId = historicalLeagueId;
                            continue;
                        }

                        const isDynasty = historicalLeague.settings?.type === 2;

                        await prisma.league.upsert({
                            where:  { userId_platform_leagueId: { userId: user.id, platform: 'sleeper', leagueId: historicalLeagueId } },
                            create: {
                                userId:         user.id,
                                platform:       'sleeper',
                                leagueId:       historicalLeagueId,
                                leagueName:     historicalLeague.name,
                                season:         historicalLeague.season,
                                status:         'complete',
                                totalRosters:   historicalLeague.total_rosters,
                                leagueType:     isDynasty ? 'Dynasty' : 'Redraft',
                                standings,
                                isHistorical:   true,
                                lastSyncedAt:   new Date(),
                            },
                            update: {
                                standings,
                                leagueName:   historicalLeague.name,
                                totalRosters: historicalLeague.total_rosters,
                                isHistorical: true,
                                lastSyncedAt: new Date(),
                            },
                        });

                        seasonsBackfilled++;
                        currentLeagueId = historicalLeagueId;
                    }
                }
            } catch (err) {
                captureError(err, { cron: 'dss-history', userId: user.id });
                usersFailed++;
            }
        }

        return Response.json({
            ok:               true,
            users:            users.length,
            seasonsBackfilled,
            seasonsSkipped,
            usersFailed,
        });
    } catch (err) {
        captureError(err, { cron: 'dss-history' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
