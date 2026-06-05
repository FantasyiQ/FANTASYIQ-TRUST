import { prisma } from '@/lib/prisma';
import { getSleeperLeagues, getLeagueRosters, getLeagueDrafts, getNflState, deriveScoringType, rosterFpts, resolveDraftType, type SleeperLeague } from '@/lib/sleeper';
import { deriveChampWeek } from '@/lib/leaguePhase';
import { shouldSkipLeague, withRetry, recordSyncFailure, recordSyncRecovered } from '@/lib/sync-recovery';
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
                    status:           sleeperLeague.status,
                    scoringType:      deriveScoringType(sleeperLeague),
                    leagueType:       sleeperLeague.settings?.type === 2 ? 'Dynasty' : 'Redraft',
                    scoringSettings:  sleeperLeague.scoring_settings ?? {},
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

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
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

        return Response.json({ ok: true, synced, skipped, users: users.length });
    } catch (err) {
        captureError(err, { cron: 'sleeper-sync' });
        const message = err instanceof Error ? err.message : 'Sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}
