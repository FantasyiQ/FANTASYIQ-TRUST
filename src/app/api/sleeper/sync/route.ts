import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSleeperLeagues, getNflState, deriveScoringType, type SleeperLeague } from '@/lib/sleeper';
import { getLeagueLimit, tierToLimitKey } from '@/lib/league-limits';
import { deriveChampWeek } from '@/lib/leaguePhase';

// POST /api/sleeper/sync — upsert selected leagues + persist sleeperUserId + auto-assign
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as {
        sleeperUserId?: string;
        leagues?: SleeperLeague[];
        inviteToken?: string;
    };
    if (!body.sleeperUserId || !Array.isArray(body.leagues) || body.leagues.length === 0) {
        return Response.json({ error: 'sleeperUserId and leagues[] are required' }, { status: 400 });
    }

    const { sleeperUserId, leagues, inviteToken } = body;

    try {
        const nflState = await getNflState();
        const userLeagues = await getSleeperLeagues(sleeperUserId, nflState.season);
        const validIds = new Set(userLeagues.map((l) => l.league_id));
        const toSync = leagues.filter((l) => validIds.has(l.league_id));
        if (toSync.length === 0) return Response.json({ error: 'No valid leagues to sync' }, { status: 400 });

        const sharedFields = (league: SleeperLeague) => {
            const playoffWeekStart = league.settings?.playoff_week_start ?? null;
            const playoffTeams     = league.settings?.playoff_teams ?? 4;
            const roundType        = league.settings?.playoff_round_type ?? 0;
            const champWeek        = playoffWeekStart !== null && playoffWeekStart > 0
                ? deriveChampWeek(playoffWeekStart, playoffTeams, roundType)
                : null;
            return {
                leagueId:         league.league_id,
                leagueName:       league.name,
                season:           league.season,
                status:           league.status,
                totalRosters:     league.total_rosters,
                scoringType:      deriveScoringType(league),
                avatar:           league.avatar,
                rosterPositions:  league.roster_positions,
                sleeperUserId,
                ...(playoffWeekStart !== null && { playoffWeekStart }),
                ...(champWeek        !== null && { champWeek }),
                lastSyncedAt:     new Date(),
            };
        };

        const [, ...leagueResults] = await Promise.all([
            // Persist sleeperUserId so cron can find this user
            prisma.user.update({ where: { id: userId }, data: { sleeperUserId } }),
            // Upsert each league, handling season rollover via previous_league_id
            ...toSync.map(async (league) => {
                if (league.previous_league_id) {
                    const prior = await prisma.league.findFirst({
                        where:  { userId, leagueId: league.previous_league_id },
                        select: { id: true },
                    });
                    // Delete the old-season row so the upsert below creates a clean
                    // new row for the current season. Updating in place risks carrying
                    // forward stale state (wrong leagueId, bad assignedPlanId, etc.).
                    if (prior) {
                        await prisma.league.delete({ where: { id: prior.id } });
                    }
                }
                return prisma.league.upsert({
                    where:  { userId_platform_leagueId: { userId, platform: 'sleeper', leagueId: league.league_id } },
                    create: { userId, platform: 'sleeper', ...sharedFields(league) },
                    update: sharedFields(league),
                    select: { id: true, leagueId: true, leagueName: true, totalRosters: true, scoringType: true, assignedPlanId: true, assignedPlanType: true },
                });
            }),
        ]);

        // ── Auto-assignment ───────────────────────────────────────────────────
        const [dbUser, invite] = await Promise.all([
            prisma.user.findUnique({
                where:  { id: userId },
                select: {
                    subscriptions: {
                        where:   { status: { in: ['active', 'trialing'] } },
                        orderBy: { createdAt: 'desc' },
                        select:  { id: true, type: true, tier: true, leagueName: true },
                    },
                    connectedLeagues: { select: { leagueExtId: true, leagueName: true } },
                },
            }),
            inviteToken
                ? prisma.leagueInvite.findUnique({
                    where:  { token: inviteToken },
                    select: { sleeperLeagueId: true, leagueName: true },
                })
                : null,
        ]);

        const playerSub = dbUser?.subscriptions.find(s => s.type === 'player') ?? null;
        const commSubs  = dbUser?.subscriptions.filter(s => s.type === 'commissioner') ?? [];
        const existingCL = dbUser?.connectedLeagues ?? [];
        const connectedExtIds = new Set(existingCL.map(cl => cl.leagueExtId).filter(Boolean));
        const connectedNames  = new Set(existingCL.map(cl => cl.leagueName.toLowerCase().trim()));

        // For the invite path: check if the commissioner has paid for this Sleeper league
        let inviteCommissionerPaid = false;
        if (invite) {
            const globalCommSub = await prisma.subscription.findFirst({
                where: {
                    type:       'commissioner',
                    leagueName: { equals: invite.leagueName, mode: 'insensitive' },
                    status:     { in: ['active', 'trialing'] },
                },
                select: { id: true },
            });
            inviteCommissionerPaid = !!globalCommSub;
        }

        let redirectTo: string | null = null;
        let limitReachedLeagueId: string | null = null;

        // ── Advisory lock: serialize concurrent syncs for the same user ───────
        // pg_advisory_xact_lock is transaction-scoped and auto-released on commit.
        // hashtext(userId) produces a stable int4 → cast to bigint for the lock key.
        // This prevents two simultaneous syncs from both reading 0 used slots and
        // both assigning leagues, which would exceed the player plan league cap.
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;

            // Re-read slot count inside the lock — this is the authoritative value
            let playerSlotsUsed = await tx.league.count({
                where: { userId, assignedPlanType: 'player' },
            });

            for (const lr of leagueResults) {
                // Already assigned — skip, UNLESS a commissioner sub now matches this
                // league (user bought a commissioner plan after initial sync). In that
                // case promote the assignment so player slots are freed.
                if (lr.assignedPlanId) {
                    if (lr.assignedPlanType !== 'commissioner') {
                        const ownCommSub = commSubs.find(
                            s => s.leagueName?.toLowerCase().trim() === lr.leagueName.toLowerCase().trim()
                        );
                        if (ownCommSub) {
                            await tx.league.update({
                                where: { id: lr.id },
                                data:  { assignedPlanId: ownCommSub.id, assignedPlanType: 'commissioner' },
                            });
                        }
                    }
                    continue;
                }

                const sleeperLeagueId = lr.leagueId;
                const alreadyConnected =
                    connectedExtIds.has(sleeperLeagueId) ||
                    connectedNames.has(lr.leagueName.toLowerCase().trim());

                // ── Branch 1: invite + commissioner paid ──────────────────────
                if (invite && sleeperLeagueId === invite.sleeperLeagueId && inviteCommissionerPaid) {
                    if (!alreadyConnected) {
                        await tx.connectedLeague.create({
                            data: { userId, leagueName: lr.leagueName, platform: 'Sleeper', leagueExtId: sleeperLeagueId },
                        });
                    }
                    await tx.league.update({
                        where: { id: lr.id },
                        data:  { assignedPlanType: 'commissioner' },
                    });
                    redirectTo ??= `/dashboard/league/${lr.id}`;
                    continue;
                }

                // ── Branch 2: user IS the commissioner ────────────────────────
                const ownCommSub = commSubs.find(
                    s => s.leagueName?.toLowerCase().trim() === lr.leagueName.toLowerCase().trim()
                );
                if (ownCommSub) {
                    await tx.league.update({
                        where: { id: lr.id },
                        data:  { assignedPlanId: ownCommSub.id, assignedPlanType: 'commissioner' },
                    });
                    redirectTo ??= `/dashboard/league/${lr.id}`;
                    continue;
                }

                // ── Branch 3: Sleeper commissioner, no plan yet ───────────────
                const sleeperLeague = toSync.find(l => l.league_id === sleeperLeagueId);
                const isSleeperCommissioner =
                    !!sleeperUserId &&
                    !!sleeperLeague?.settings?.commissioner_id &&
                    String(sleeperLeague.settings.commissioner_id).trim() === String(sleeperUserId).trim();

                if (isSleeperCommissioner) {
                    redirectTo ??= `/dashboard/league/${lr.id}?showCommissionerPlanModal=1`;
                    continue;
                }

                // ── Branch 4: user has a player plan ─────────────────────────
                if (playerSub) {
                    const limitKey = tierToLimitKey(playerSub.tier);
                    const limit    = getLeagueLimit(limitKey);

                    if (playerSlotsUsed < limit) {
                        if (!alreadyConnected) {
                            await tx.connectedLeague.create({
                                data: { userId, leagueName: lr.leagueName, platform: 'Sleeper', leagueExtId: sleeperLeagueId },
                            });
                            playerSlotsUsed++;
                        }
                        await tx.league.update({
                            where: { id: lr.id },
                            data:  { assignedPlanId: playerSub.id, assignedPlanType: 'player' },
                        });
                        redirectTo ??= `/dashboard/league/${lr.id}`;
                    } else {
                        limitReachedLeagueId ??= lr.id;
                    }
                    continue;
                }

                // ── Branch 5: no plans ────────────────────────────────────────
                redirectTo ??= `/dashboard/league/${lr.id}?showPlanModal=1`;
            }
        });

        // If any leagues hit the player plan limit, redirect to upgrade
        if (limitReachedLeagueId && !redirectTo) {
            redirectTo = `/dashboard/upgrade?reason=player_plan_limit&leagueId=${limitReachedLeagueId}`;
        }

        return Response.json({
            synced:     toSync.length,
            leagues:    leagueResults,
            redirectTo: redirectTo ?? '/dashboard',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        return Response.json({ error: message }, { status: 500 });
    }
}

// DELETE /api/sleeper/sync?leagueId=xxx
export async function DELETE(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const leagueId = request.nextUrl.searchParams.get('leagueId');
    if (!leagueId) return Response.json({ error: 'leagueId is required' }, { status: 400 });

    try {
        await prisma.league.delete({
            where: { userId_platform_leagueId: { userId, platform: 'sleeper', leagueId } },
        });
        return Response.json({ deleted: true });
    } catch {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }
}
