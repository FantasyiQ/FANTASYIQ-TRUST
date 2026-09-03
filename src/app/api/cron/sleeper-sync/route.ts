import { prisma } from '@/lib/prisma';
import { getSleeperLeagues, getLeague, getLeagueRosters, getLeagueDrafts, getNflState, buildCoreSleeperLeagueFields, rosterFpts, resolveDraftType, type SleeperLeague } from '@/lib/sleeper';
import { deriveChampWeek } from '@/lib/leaguePhase';
import { shouldSkipLeague, withRetry, recordSyncFailure, recordSyncRecovered } from '@/lib/sync-recovery';
import { withCronLog } from '@/lib/cron-logger';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

const USER_BATCH_SIZE = 10; // users processed in parallel per batch

type DbLeague = {
    id:              string;
    leagueId:        string;
    syncStatus:      string;
    syncErrorCount:  number;
    syncLastErrorAt: Date | null;
};

async function syncLeague(
    userId:        string,
    dbLeague:      DbLeague,
    sleeperLeague: SleeperLeague,
): Promise<{ synced: number; skipped: number }> {
    if (shouldSkipLeague(dbLeague)) return { synced: 0, skipped: 1 };

    try {
        await withRetry(async () => {
            const [rosters, drafts] = await Promise.all([
                getLeagueRosters(dbLeague.leagueId),
                getLeagueDrafts(dbLeague.leagueId),
            ]);

            const standings = rosters.map((r) => ({
                rosterId: r.roster_id,
                ownerId:  r.owner_id,
                wins:     r.settings?.wins ?? 0,
                losses:   r.settings?.losses ?? 0,
                ties:     r.settings?.ties ?? 0,
                fpts:     rosterFpts(r.settings),
            })).sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);

            const safeDrafts   = Array.isArray(drafts) ? drafts : [];
            const currentDraft = sleeperLeague.draft_id
                ? safeDrafts.find(d => d.draft_id === sleeperLeague.draft_id) ?? null
                : null;
            const draftStartTime = currentDraft?.start_time ? BigInt(currentDraft.start_time) : null;
            const draftStatus    = currentDraft?.status ?? null;
            const draftType      = resolveDraftType(currentDraft);

            const playoffWeekStart = sleeperLeague.settings?.playoff_week_start ?? null;
            const playoffTeams     = sleeperLeague.settings?.playoff_teams ?? 4;
            const roundType        = sleeperLeague.settings?.playoff_round_type ?? 0;
            const champWeek        = playoffWeekStart !== null && playoffWeekStart > 0
                ? deriveChampWeek(playoffWeekStart, playoffTeams, roundType)
                : null;

            await prisma.league.update({
                where: { id: dbLeague.id },
                data: {
                    ...buildCoreSleeperLeagueFields(sleeperLeague, rosters),
                    standings,
                    draftStartTime,
                    draftStatus,
                    draftType,
                    ...(playoffWeekStart !== null && { playoffWeekStart }),
                    ...(champWeek        !== null && { champWeek }),
                    lastSyncedAt: new Date(),
                },
            });
        });

        await recordSyncRecovered(dbLeague.id);
        return { synced: 1, skipped: 0 };
    } catch (err) {
        await recordSyncFailure({ userId, leagueDbId: dbLeague.id, platform: 'sleeper', err });
        return { synced: 0, skipped: 0 };
    }
}

async function syncUser(
    user:   { id: string; sleeperUserId: string | null; leagues: DbLeague[] },
    season: string,
): Promise<{ synced: number; skipped: number }> {
    if (!user.sleeperUserId) return { synced: 0, skipped: 0 };

    let sleeperLeagues;
    try {
        sleeperLeagues = await getSleeperLeagues(user.sleeperUserId, season);
    } catch { return { synced: 0, skipped: 0 }; } // can't fetch league list — skip user entirely

    const sleeperMap = new Map(sleeperLeagues.map((l) => [l.league_id, l]));

    // Sync all leagues for this user in parallel — each is independent.
    const results = await Promise.all(
        user.leagues
            .filter(dbLeague => sleeperMap.has(dbLeague.leagueId))
            .map(dbLeague => syncLeague(user.id, dbLeague, sleeperMap.get(dbLeague.leagueId)!)),
    );

    return results.reduce(
        (acc, r) => ({ synced: acc.synced + r.synced, skipped: acc.skipped + r.skipped }),
        { synced: 0, skipped: 0 },
    );
}

// Fallback path for leagues whose owning FiQ user has no personal Sleeper
// account linked (sleeperUserId null) — e.g. someone who signed up with
// email/password and only ever joined via a league invite link, never
// connecting their own Sleeper account. syncUser() above can't even start
// for them (it needs a real sleeperUserId to ask Sleeper "what leagues is
// this person in"), which was silently leaving these leagues frozen forever
// with no error and no scoringSettings. League-level data (roster
// composition, scoring settings, standings) is public on Sleeper's API and
// doesn't actually require the viewer's own account — only the league's own
// leagueId, which every League row already stores directly.
async function syncOrphanedLeague(userId: string, dbLeague: DbLeague): Promise<{ synced: number; skipped: number }> {
    if (shouldSkipLeague(dbLeague)) return { synced: 0, skipped: 1 };
    try {
        // Only retry the fetch here — syncLeague() already has its own
        // retry + failure/recovery tracking around the DB update itself.
        const sleeperLeague = await withRetry(() => getLeague(dbLeague.leagueId));
        return await syncLeague(userId, dbLeague, sleeperLeague);
    } catch (err) {
        await recordSyncFailure({ userId, leagueDbId: dbLeague.id, platform: 'sleeper', err });
        return { synced: 0, skipped: 0 };
    }
}

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('sleeper-sync', async () => {
            const [users, nflState] = await Promise.all([
                prisma.user.findMany({
                    where: { sleeperUserId: { not: null } },
                    select: {
                        id: true, sleeperUserId: true,
                        leagues: {
                            select: { id: true, leagueId: true, syncStatus: true, syncErrorCount: true, syncLastErrorAt: true },
                        },
                    },
                }),
                getNflState(),
            ]);

            let synced  = 0;
            let skipped = 0;

            for (let i = 0; i < users.length; i += USER_BATCH_SIZE) {
                const batch   = users.slice(i, i + USER_BATCH_SIZE);
                const results = await Promise.all(batch.map(user => syncUser(user, nflState.season)));
                for (const r of results) {
                    synced  += r.synced;
                    skipped += r.skipped;
                }
            }

            // Orphaned leagues: owned by a user with no personal Sleeper
            // account linked (e.g. joined only via an invite link after an
            // email/password signup) — syncUser() above never even looks at
            // these since it can't ask Sleeper for a league list without a
            // real sleeperUserId. Sync them directly by their own leagueId.
            const orphanedLeagues = await prisma.league.findMany({
                where:  { platform: 'sleeper', user: { sleeperUserId: null } },
                select: { id: true, leagueId: true, userId: true, syncStatus: true, syncErrorCount: true, syncLastErrorAt: true },
            });
            let orphanSynced = 0;
            for (let i = 0; i < orphanedLeagues.length; i += USER_BATCH_SIZE) {
                const batch   = orphanedLeagues.slice(i, i + USER_BATCH_SIZE);
                const results = await Promise.all(batch.map(l => syncOrphanedLeague(l.userId, l)));
                for (const r of results) {
                    synced      += r.synced;
                    orphanSynced += r.synced;
                    skipped     += r.skipped;
                }
            }

            return {
                processed: synced,
                message: `${synced} leagues synced (${orphanSynced} orphaned) · ${skipped} skipped · ${users.length} users`,
            };
        });
        return Response.json({ ok: true, ...result });
    } catch (err) {
        captureError(err, { cron: 'sleeper-sync' });
        const message = err instanceof Error ? err.message : 'Sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
