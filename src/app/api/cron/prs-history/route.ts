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

const MAX_HISTORY_DEPTH   = 5;   // covers ~2020–2025 for established leagues
const DEFAULT_PLAYOFF_WEEK = 15; // fallback when playoff_week_start not set

function isValidLeagueId(id: string | null | undefined): id is string {
    return !!id && id !== '0' && id.length > 4;
}

// ── Shared cache types ────────────────────────────────────────────────────────

interface LeagueData {
    season:           string;
    isDynasty:        boolean;
    previousLeagueId: string | null;
    playoffWeekStart: number;           // first week of playoffs; regular season = 1..playoffWeekStart-1
    ownerIds:         Set<string>;      // sleeper user_ids present at season end
    rosterIdToOwner:  Map<number, string>; // roster_id → sleeper user_id
}

type PrsRow = {
    userId:    string;
    eventType: PrsEventType;
    eventDate: Date;
    sourceRef: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchLeagueData(
    leagueId: string,
    cache: Map<string, LeagueData | null>,
): Promise<LeagueData | null> {
    if (cache.has(leagueId)) return cache.get(leagueId)!;

    try {
        const [league, rosters] = await Promise.all([
            getLeague(leagueId),
            getLeagueRosters(leagueId),
        ]);

        if (!Array.isArray(rosters) || rosters.length === 0) {
            cache.set(leagueId, null);
            return null;
        }

        const playoffWeekStart = (league.settings?.playoff_week_start ?? 0) > 0
            ? league.settings!.playoff_week_start!
            : DEFAULT_PLAYOFF_WEEK;

        const ownerIds        = new Set(rosters.filter(r => r.owner_id).map(r => r.owner_id!));
        const rosterIdToOwner = new Map(rosters.filter(r => r.owner_id).map(r => [r.roster_id, r.owner_id!]));

        const data: LeagueData = {
            season:           league.season,
            isDynasty:        league.settings?.type === 2,
            previousLeagueId: isValidLeagueId(league.previous_league_id) ? league.previous_league_id : null,
            playoffWeekStart,
            ownerIds,
            rosterIdToOwner,
        };

        cache.set(leagueId, data);
        return data;
    } catch {
        cache.set(leagueId, null);
        return null;
    }
}

async function fetchTransactions(
    leagueId: string,
    week: number,
    cache: Map<string, SleeperTransaction[]>,
): Promise<SleeperTransaction[]> {
    const key = `${leagueId}:${week}`;
    if (cache.has(key)) return cache.get(key)!;
    try {
        const txns = await getLeagueTransactions(leagueId, week);
        const result = Array.isArray(txns) ? txns : [];
        cache.set(key, result);
        return result;
    } catch {
        cache.set(key, []);
        return [];
    }
}

async function fetchMatchups(
    leagueId: string,
    week: number,
    cache: Map<string, SleeperMatchup[]>,
): Promise<SleeperMatchup[]> {
    const key = `${leagueId}:${week}`;
    if (cache.has(key)) return cache.get(key)!;
    try {
        const matchups = await getLeagueMatchups(leagueId, week);
        const result = Array.isArray(matchups) ? matchups : [];
        cache.set(key, result);
        return result;
    } catch {
        cache.set(key, []);
        return [];
    }
}

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Build a sleeper user_id → FiQ user_id lookup
        const sleeperUsers = await prisma.user.findMany({
            where:  { sleeperUserId: { not: null } },
            select: { id: true, sleeperUserId: true },
        });
        const sleeperToFiQ = new Map(sleeperUsers.map(u => [u.sleeperUserId!, u.id]));

        // Only users who have at least one current (non-historical) Sleeper league
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

        // Shared Sleeper API caches (deduplicates calls across users in the same league)
        const leagueDataCache = new Map<string, LeagueData | null>();
        const txnCache        = new Map<string, SleeperTransaction[]>();
        const matchupCache    = new Map<string, SleeperMatchup[]>();

        const affectedUserIds = new Set<string>();
        let eventsWritten = 0;
        let usersFailed   = 0;

        for (const user of users) {
            try {
                const sleeperUserId = user.sleeperUserId!;
                const rows: PrsRow[] = [];

                for (const dbLeague of user.leagues) {
                    // Load the current season's data first (for retention baseline)
                    const currentData = await fetchLeagueData(dbLeague.leagueId, leagueDataCache);
                    if (!currentData) continue;

                    let currentId             = dbLeague.leagueId;
                    let nextSeasonOwnerIds    = currentData.ownerIds; // owners in more-recent season

                    for (let depth = 0; depth < MAX_HISTORY_DEPTH; depth++) {
                        const currentLeagueData = await fetchLeagueData(currentId, leagueDataCache);
                        if (!currentLeagueData) break;

                        const histId = currentLeagueData.previousLeagueId;
                        if (!histId) break;

                        const histData = await fetchLeagueData(histId, leagueDataCache);
                        if (!histData) {
                            nextSeasonOwnerIds = new Set();
                            currentId = histId;
                            continue;
                        }

                        // ── Skip if already processed for this user+league ────
                        const seasonRef = `hist:${histId}:${sleeperUserId}:season`;
                        const alreadyDone = await prisma.prsEvent.findFirst({
                            where:  { userId: user.id, sourceRef: seasonRef },
                            select: { id: true },
                        });
                        if (alreadyDone) {
                            // Still update retention baseline and walk further back
                            nextSeasonOwnerIds = histData.ownerIds;
                            currentId          = histId;
                            continue;
                        }

                        const eventDate = new Date(`${histData.season}-12-01`); // end-of-season proxy

                        // ── A. Season completion ──────────────────────────────
                        if (histData.ownerIds.has(sleeperUserId)) {
                            rows.push({
                                userId:    user.id,
                                eventType: 'verified_season',
                                eventDate,
                                sourceRef: seasonRef,
                            });
                        }

                        // ── B. Retention (dynasty only) ───────────────────────
                        if (histData.isDynasty && histData.ownerIds.has(sleeperUserId)) {
                            const stayed = nextSeasonOwnerIds.has(sleeperUserId);
                            rows.push({
                                userId:    user.id,
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
                            for (let week = 1; week <= regularWeeks; week++) {
                                const matchups  = await fetchMatchups(histId, week, matchupCache);
                                const myMatchup = matchups.find(m => m.roster_id === myRosterId);
                                if (!myMatchup) continue;

                                const starters  = myMatchup.starters ?? [];
                                const hasEmpty  = starters.length === 0 || starters.some(s => s === '0' || s === '');
                                rows.push({
                                    userId:    user.id,
                                    eventType: hasEmpty ? 'lineup_missed' : 'lineup_set',
                                    eventDate: new Date(`${histData.season}-01-01`),
                                    sourceRef: `hist:${histId}:week${week}:${myRosterId}:lineup`,
                                });
                            }

                            // ── D & E. Trades & waivers (all weeks incl. playoffs) ──
                            const allWeeks = Math.min(histData.playoffWeekStart + 4, 21);
                            for (let week = 1; week <= allWeeks; week++) {
                                const txns = await fetchTransactions(histId, week, txnCache);
                                for (const txn of txns) {
                                    if (txn.status !== 'complete') continue;

                                    if (txn.type === 'trade') {
                                        const participants: string[] = txn.consenter_ids?.length
                                            ? txn.consenter_ids
                                            : txn.roster_ids
                                                .map(rid => histData.rosterIdToOwner.get(rid))
                                                .filter((id): id is string => id != null);

                                        if (participants.includes(sleeperUserId)) {
                                            rows.push({
                                                userId:    user.id,
                                                eventType: 'trade_response',
                                                eventDate: new Date(txn.status_updated),
                                                sourceRef: `txn:${txn.transaction_id}:${sleeperUserId}`,
                                            });
                                        }
                                    } else if (txn.type === 'waiver' || txn.type === 'free_agent') {
                                        if (txn.creator === sleeperUserId) {
                                            rows.push({
                                                userId:    user.id,
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
                }

                // Batch write all events for this user
                if (rows.length > 0) {
                    const result = await prisma.prsEvent.createMany({
                        data:           rows,
                        skipDuplicates: true,
                    });
                    if (result.count > 0) {
                        eventsWritten += result.count;
                        affectedUserIds.add(user.id);
                    }
                }
            } catch (err) {
                captureError(err, { cron: 'prs-history', userId: user.id });
                usersFailed++;
            }
        }

        // ── Recalculate PRS for every user with new events ────────────────────
        let prsComputed = 0;
        for (const userId of affectedUserIds) {
            try {
                await calculateAndSavePrs(userId);
                prsComputed++;
            } catch (err) {
                captureError(err, { cron: 'prs-history', phase: 'calculate', userId });
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
