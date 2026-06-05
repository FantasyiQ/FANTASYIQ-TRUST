// GET /api/cron/prs-history
// Nightly cron (3am UTC) — backfills historical PRS events for all past seasons
// by walking the previous_league_id chain for every Sleeper league a FiQ user
// has participated in.
//
// Mirrors dss-history, but writes PrsEvent rows instead of League standings.
//
// Event types written:
//   verified_season    — user completed the season (owner_id present at end)
//   retention_stayed   — user returned to the franchise next season (dynasty only)
//   retention_left     — user did not return to the franchise next season (dynasty only)
//   lineup_set         — user had a full starting lineup for a regular-season week
//   lineup_missed      — user had at least one empty starter slot
//   trade_response     — user participated in a completed trade
//   waiver_active      — user submitted a successful waiver/FA claim
//
// Idempotency:
//   Every event has a stable sourceRef. The partial unique index on
//   (userId, eventType, sourceRef) WHERE sourceRef IS NOT NULL means
//   createMany({ skipDuplicates: true }) is fully safe to re-run.
//   The "season" sourceRef doubles as a skip signal — if it already exists
//   for a user+league, we skip all Sleeper API fetches for that season.
//
// After writing events, calculateAndSavePrs is called for every user that
// had new events, so PRS scores are live after this cron completes.

import { prisma } from '@/lib/prisma';
import {
    getLeague,
    getLeagueRosters,
    getLeagueTransactions,
    getLeagueMatchups,
} from '@/lib/sleeper';
import { calculateAndSavePrs } from '@/lib/prs';
import { captureError } from '@/lib/sentry';
import type { SleeperTransaction, SleeperMatchup } from '@/lib/sleeper';
import type { PrsEventType } from '@prisma/client';

export const maxDuration = 300;

const MAX_HISTORY_DEPTH    = 5;  // covers ~2020–2025 for established leagues
const DEFAULT_PLAYOFF_WEEK = 15; // fallback when playoff_week_start not set
const USER_BATCH_SIZE      = 5;  // users processed in parallel per batch
const PRS_BATCH_SIZE       = 10; // PRS recalcs processed in parallel per batch

function isValidLeagueId(id: string | null | undefined): id is string {
    return !!id && id !== '0' && id.length > 4;
}

// ── Shared cache types ────────────────────────────────────────────────────────

interface LeagueData {
    season:           string;
    isDynasty:        boolean;
    previousLeagueId: string | null;
    playoffWeekStart: number;              // first week of playoffs; regular season = 1..playoffWeekStart-1
    ownerIds:         Set<string>;         // sleeper user_ids present at season end
    rosterIdToOwner:  Map<number, string>; // roster_id → sleeper user_id
}

type PrsRow = {
    userId:    string;
    eventType: PrsEventType;
    eventDate: Date;
    sourceRef: string;
};

// Promise-based caches prevent duplicate concurrent API calls when multiple
// users in the same batch are in the same Sleeper league. The first caller
// stores the in-flight promise; subsequent callers await the same promise.
type LeagueCache = Map<string, Promise<LeagueData | null>>;
type TxnCache    = Map<string, Promise<SleeperTransaction[]>>;
type MatchupCache = Map<string, Promise<SleeperMatchup[]>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchLeagueData(
    leagueId: string,
    cache:    LeagueCache,
): Promise<LeagueData | null> {
    if (!cache.has(leagueId)) {
        cache.set(leagueId, (async (): Promise<LeagueData | null> => {
            try {
                const [league, rosters] = await Promise.all([
                    getLeague(leagueId),
                    getLeagueRosters(leagueId),
                ]);

                if (!Array.isArray(rosters) || rosters.length === 0) return null;

                const playoffWeekStart = (league.settings?.playoff_week_start ?? 0) > 0
                    ? league.settings!.playoff_week_start!
                    : DEFAULT_PLAYOFF_WEEK;

                const ownerIds        = new Set(rosters.filter(r => r.owner_id).map(r => r.owner_id!));
                const rosterIdToOwner = new Map(rosters.filter(r => r.owner_id).map(r => [r.roster_id, r.owner_id!]));

                return {
                    season:           league.season,
                    isDynasty:        league.settings?.type === 2,
                    previousLeagueId: isValidLeagueId(league.previous_league_id) ? league.previous_league_id : null,
                    playoffWeekStart,
                    ownerIds,
                    rosterIdToOwner,
                };
            } catch {
                return null;
            }
        })());
    }
    return cache.get(leagueId)!;
}

async function fetchTransactions(
    leagueId: string,
    week:     number,
    cache:    TxnCache,
): Promise<SleeperTransaction[]> {
    const key = `${leagueId}:${week}`;
    if (!cache.has(key)) {
        cache.set(key, getLeagueTransactions(leagueId, week)
            .then(txns => Array.isArray(txns) ? txns : [])
            .catch(() => []));
    }
    return cache.get(key)!;
}

async function fetchMatchups(
    leagueId: string,
    week:     number,
    cache:    MatchupCache,
): Promise<SleeperMatchup[]> {
    const key = `${leagueId}:${week}`;
    if (!cache.has(key)) {
        cache.set(key, getLeagueMatchups(leagueId, week)
            .then(ms => Array.isArray(ms) ? ms : [])
            .catch(() => []));
    }
    return cache.get(key)!;
}

// ── Per-league processor ──────────────────────────────────────────────────────

async function processLeague(
    userId:            string,
    sleeperUserId:     string,
    leagueId:          string,
    processedSeasonRefs: Set<string>,
    caches:            { league: LeagueCache; txn: TxnCache; matchup: MatchupCache },
): Promise<PrsRow[]> {
    const rows: PrsRow[] = [];

    const currentData = await fetchLeagueData(leagueId, caches.league);
    if (!currentData) return rows;

    let currentId          = leagueId;
    let nextSeasonOwnerIds = currentData.ownerIds; // owners in the more-recent season

    for (let depth = 0; depth < MAX_HISTORY_DEPTH; depth++) {
        const currentLeagueData = await fetchLeagueData(currentId, caches.league);
        if (!currentLeagueData) break;

        const histId = currentLeagueData.previousLeagueId;
        if (!histId) break;

        const histData = await fetchLeagueData(histId, caches.league);
        if (!histData) {
            nextSeasonOwnerIds = new Set();
            currentId          = histId;
            continue;
        }

        // Skip if we already wrote the verified_season event for this depth.
        // processedSeasonRefs is pre-fetched once per user (not once per depth).
        const seasonRef = `hist:${histId}:${sleeperUserId}:season`;
        if (processedSeasonRefs.has(seasonRef)) {
            nextSeasonOwnerIds = histData.ownerIds;
            currentId          = histId;
            continue;
        }

        const eventDate = new Date(`${histData.season}-12-01`); // end-of-season proxy

        // ── A. Season completion ──────────────────────────────
        if (histData.ownerIds.has(sleeperUserId)) {
            rows.push({ userId, eventType: 'verified_season', eventDate, sourceRef: seasonRef });
        }

        // ── B. Retention (dynasty only) ───────────────────────
        if (histData.isDynasty && histData.ownerIds.has(sleeperUserId)) {
            const stayed = nextSeasonOwnerIds.has(sleeperUserId);
            rows.push({
                userId,
                eventType: stayed ? 'retention_stayed' : 'retention_left',
                eventDate,
                sourceRef: `hist:${histId}:${sleeperUserId}:retention`,
            });
        }

        // Find this user's roster_id in the historical league
        let myRosterId: number | null = null;
        for (const [rosterId, ownerId] of histData.rosterIdToOwner) {
            if (ownerId === sleeperUserId) { myRosterId = rosterId; break; }
        }

        if (myRosterId !== null) {
            const regularWeeks = Math.min(histData.playoffWeekStart - 1, 17);

            // ── C. Lineup behavior ────────────────────────────
            const matchupWeeks = await Promise.all(
                Array.from({ length: regularWeeks }, (_, i) =>
                    fetchMatchups(histId, i + 1, caches.matchup),
                ),
            );
            for (let week = 1; week <= regularWeeks; week++) {
                const matchups  = matchupWeeks[week - 1];
                const myMatchup = matchups.find(m => m.roster_id === myRosterId);
                if (!myMatchup) continue;

                const starters = myMatchup.starters ?? [];
                const hasEmpty = starters.length === 0 || starters.some(s => s === '0' || s === '');
                rows.push({
                    userId,
                    eventType: hasEmpty ? 'lineup_missed' : 'lineup_set',
                    eventDate: new Date(`${histData.season}-01-01`),
                    sourceRef: `hist:${histId}:week${week}:${myRosterId}:lineup`,
                });
            }

            // ── D & E. Trades & waivers (all weeks incl. playoffs) ──
            const allWeeks  = Math.min(histData.playoffWeekStart + 4, 21);
            const txnWeeks  = await Promise.all(
                Array.from({ length: allWeeks }, (_, i) =>
                    fetchTransactions(histId, i + 1, caches.txn),
                ),
            );
            for (let week = 1; week <= allWeeks; week++) {
                for (const txn of txnWeeks[week - 1]) {
                    if (txn.status !== 'complete') continue;

                    if (txn.type === 'trade') {
                        const participants: string[] = txn.consenter_ids?.length
                            ? txn.consenter_ids
                            : txn.roster_ids
                                .map(rid => histData.rosterIdToOwner.get(rid))
                                .filter((id): id is string => id != null);

                        if (participants.includes(sleeperUserId)) {
                            rows.push({
                                userId,
                                eventType: 'trade_response',
                                eventDate: new Date(txn.status_updated),
                                sourceRef: `txn:${txn.transaction_id}:${sleeperUserId}`,
                            });
                        }
                    } else if (txn.type === 'waiver' || txn.type === 'free_agent') {
                        if (txn.creator === sleeperUserId) {
                            rows.push({
                                userId,
                                eventType: 'waiver_active',
                                eventDate: new Date(txn.status_updated),
                                sourceRef: `txn:${txn.transaction_id}`,
                            });
                        }
                    }
                }
            }
        }

        nextSeasonOwnerIds = histData.ownerIds;
        currentId          = histId;
    }

    return rows;
}

// ── Per-user processor ────────────────────────────────────────────────────────

async function processUser(
    user:   { id: string; sleeperUserId: string | null; leagues: { leagueId: string }[] },
    caches: { league: LeagueCache; txn: TxnCache; matchup: MatchupCache },
): Promise<{ eventsWritten: number; affected: boolean }> {
    const sleeperUserId = user.sleeperUserId!;

    // Pre-fetch all verified_season sourceRefs for this user in a single query,
    // replacing the per-depth findFirst calls (N queries → 1 query per user).
    const processedSeasonRefs = new Set(
        (await prisma.prsEvent.findMany({
            where:  { userId: user.id, eventType: 'verified_season', sourceRef: { startsWith: 'hist:' } },
            select: { sourceRef: true },
        })).map(e => e.sourceRef!),
    );

    // Process all leagues for this user in parallel — each league walks its own
    // history chain and accumulates rows independently.
    const rowsPerLeague = await Promise.all(
        user.leagues.map(dbLeague =>
            processLeague(user.id, sleeperUserId, dbLeague.leagueId, processedSeasonRefs, caches),
        ),
    );
    const rows = rowsPerLeague.flat();

    if (rows.length === 0) return { eventsWritten: 0, affected: false };

    const result = await prisma.prsEvent.createMany({ data: rows, skipDuplicates: true });
    return { eventsWritten: result.count, affected: result.count > 0 };
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
                leagues: { some: { platform: 'sleeper', isHistorical: false } },
            },
            select: {
                id:            true,
                sleeperUserId: true,
                leagues: {
                    where:  { platform: 'sleeper', isHistorical: false },
                    select: { leagueId: true },
                },
            },
        });

        // Shared API caches — promise-based so concurrent users sharing a Sleeper
        // league dedup to a single in-flight fetch rather than N parallel fetches.
        const caches = {
            league:  new Map() as LeagueCache,
            txn:     new Map() as TxnCache,
            matchup: new Map() as MatchupCache,
        };

        const affectedUserIds = new Set<string>();
        let eventsWritten = 0;
        let usersFailed   = 0;

        for (let i = 0; i < users.length; i += USER_BATCH_SIZE) {
            const batch   = users.slice(i, i + USER_BATCH_SIZE);
            const results = await Promise.allSettled(batch.map(user => processUser(user, caches)));

            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled') {
                    eventsWritten += result.value.eventsWritten;
                    if (result.value.affected) affectedUserIds.add(batch[j].id);
                } else {
                    captureError(result.reason, { cron: 'prs-history', userId: batch[j].id });
                    usersFailed++;
                }
            }
        }

        // Recalculate PRS in parallel batches for every user with new events.
        let prsComputed = 0;
        const affected  = [...affectedUserIds];
        for (let i = 0; i < affected.length; i += PRS_BATCH_SIZE) {
            const results = await Promise.allSettled(
                affected.slice(i, i + PRS_BATCH_SIZE).map(userId => calculateAndSavePrs(userId)),
            );
            for (const result of results) {
                if (result.status === 'fulfilled') prsComputed++;
                else captureError(result.reason, { cron: 'prs-history', phase: 'calculate' });
            }
        }

        return Response.json({
            ok: true,
            users:         users.length,
            eventsWritten,
            prsComputed,
            usersFailed,
        });
    } catch (err) {
        captureError(err, { cron: 'prs-history' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
