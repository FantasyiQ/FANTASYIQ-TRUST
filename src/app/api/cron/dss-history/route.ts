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
import { getLeague, getLeagueRosters, rosterFpts, type SleeperLeague } from '@/lib/sleeper';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

// How many seasons back to walk for each dynasty franchise.
// 6 covers 2019–2025 for a league in its 7th year.
const MAX_HISTORY_DEPTH = 6;
const USER_BATCH_SIZE   = 5; // users processed in parallel per batch

// Sleeper sometimes uses "0" as a null sentinel for previous_league_id
function isValidLeagueId(id: string | null | undefined): id is string {
    return !!id && id !== '0' && id.length > 4;
}

// Promise-based cache so parallel users sharing a Sleeper league dedup to
// a single in-flight fetch rather than N concurrent fetches.
type LeagueCache = Map<string, Promise<SleeperLeague | null>>;

function getCachedLeague(leagueId: string, cache: LeagueCache): Promise<SleeperLeague | null> {
    if (!cache.has(leagueId)) {
        cache.set(leagueId, getLeague(leagueId).catch(() => null));
    }
    return cache.get(leagueId)!;
}

// ── Per-league processor ──────────────────────────────────────────────────────

async function processLeague(
    userId:      string,
    leagueId:    string,
    existingIds: Set<string>,     // pre-fetched, read-only; upsert is idempotent for dups
    cache:       LeagueCache,
): Promise<{ backfilled: number; skipped: number }> {
    let currentLeagueId = leagueId;
    let backfilled = 0;
    let skipped    = 0;

    for (let depth = 0; depth < MAX_HISTORY_DEPTH; depth++) {
        const sleeperLeague = await getCachedLeague(currentLeagueId, cache);
        if (!sleeperLeague) break;

        const prevLeagueId = sleeperLeague.previous_league_id;
        if (!isValidLeagueId(prevLeagueId)) break;
        const historicalLeagueId = prevLeagueId;

        if (existingIds.has(historicalLeagueId)) {
            skipped++;
            currentLeagueId = historicalLeagueId;
            continue;
        }

        let historicalLeague: SleeperLeague;
        let rosters;
        try {
            const [hl, rs] = await Promise.all([
                getCachedLeague(historicalLeagueId, cache),
                getLeagueRosters(historicalLeagueId),
            ]);
            if (!hl) break;
            historicalLeague = hl;
            rosters = rs;
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
                wins:     r.settings?.wins   ?? 0,
                losses:   r.settings?.losses ?? 0,
                ties:     r.settings?.ties   ?? 0,
                fpts:     rosterFpts(r.settings),
            }))
            .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);

        // Only store if the season actually had games played
        const totalGames = standings.reduce((sum, r) => sum + r.wins + r.losses + r.ties, 0);
        if (totalGames === 0) {
            currentLeagueId = historicalLeagueId;
            continue;
        }

        const isDynasty = historicalLeague.settings?.type === 2;

        await prisma.league.upsert({
            where:  { userId_platform_leagueId: { userId, platform: 'sleeper', leagueId: historicalLeagueId } },
            create: {
                userId,
                platform:     'sleeper',
                leagueId:     historicalLeagueId,
                leagueName:   historicalLeague.name,
                season:       historicalLeague.season,
                status:       'complete',
                totalRosters: historicalLeague.total_rosters,
                leagueType:   isDynasty ? 'Dynasty' : 'Redraft',
                standings,
                isHistorical: true,
                lastSyncedAt: new Date(),
            },
            update: {
                standings,
                leagueName:   historicalLeague.name,
                totalRosters: historicalLeague.total_rosters,
                isHistorical: true,
                lastSyncedAt: new Date(),
            },
        });

        backfilled++;
        currentLeagueId = historicalLeagueId;
    }

    return { backfilled, skipped };
}

// ── Per-user processor ────────────────────────────────────────────────────────

async function processUser(
    user:  { id: string; leagues: { leagueId: string }[] },
    cache: LeagueCache,
): Promise<{ backfilled: number; skipped: number }> {
    // Pre-fetch all existing league IDs for this user in one query, replacing
    // the per-depth findFirst calls (N queries → 1 query per user).
    const existingIds = new Set(
        (await prisma.league.findMany({
            where:  { userId: user.id, platform: 'sleeper' },
            select: { leagueId: true },
        })).map(l => l.leagueId),
    );

    // Process all dynasty leagues for this user in parallel — chains are independent.
    const results = await Promise.all(
        user.leagues.map(dbLeague => processLeague(user.id, dbLeague.leagueId, existingIds, cache)),
    );

    return results.reduce(
        (acc, r) => ({ backfilled: acc.backfilled + r.backfilled, skipped: acc.skipped + r.skipped }),
        { backfilled: 0, skipped: 0 },
    );
}

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
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

        // Shared league cache — deduplicates Sleeper API calls across users in the same batch.
        const leagueCache: LeagueCache = new Map();

        let seasonsBackfilled = 0;
        let seasonsSkipped    = 0;
        let usersFailed       = 0;

        for (let i = 0; i < users.length; i += USER_BATCH_SIZE) {
            const batch   = users.slice(i, i + USER_BATCH_SIZE);
            const results = await Promise.allSettled(batch.map(user => processUser(user, leagueCache)));

            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled') {
                    seasonsBackfilled += result.value.backfilled;
                    seasonsSkipped    += result.value.skipped;
                } else {
                    captureError(result.reason, { cron: 'dss-history', userId: batch[j].id });
                    usersFailed++;
                }
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
