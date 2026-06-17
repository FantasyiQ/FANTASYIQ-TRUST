import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeague, deriveScoringType } from '@/lib/sleeper';
import { calculateAndSavePrs } from '@/lib/prs';

// Looks up the commissioner's active League row for this Sleeper league and
// propagates commissioner coverage to the member's League row.
async function applyCommissionerCoverage(memberLeagueDbId: string, sleeperLeagueId: string): Promise<void> {
    const commLeague = await prisma.league.findFirst({
        where:  { leagueId: sleeperLeagueId, assignedPlanType: 'commissioner', assignedPlanId: { not: null } },
        select: { assignedPlanId: true },
    });
    if (!commLeague?.assignedPlanId) return;

    await prisma.league.update({
        where: { id: memberLeagueDbId },
        data:  { assignedPlanId: commLeague.assignedPlanId, assignedPlanType: 'commissioner' },
    });
}

// Auto-accept an invite for a logged-in user:
// 1. Fetch the Sleeper league (public API — no user credentials needed)
// 2. Upsert the League record in our DB
// 3. Propagate commissioner coverage to the member's League row
// 4. Add a ConnectedLeague entry
// 5. Return the DB league ID for redirect
async function acceptInvite(
    userId:        string,
    sleeperUserId: string | null,
    invite: { sleeperLeagueId: string },
): Promise<string> {
    const sl = await getLeague(invite.sleeperLeagueId);

    const fields = {
        leagueId:        sl.league_id,
        leagueName:      sl.name,
        season:          sl.season,
        status:          sl.status,
        totalRosters:    sl.total_rosters,
        scoringType:     deriveScoringType(sl),
        avatar:          sl.avatar ?? null,
        rosterPositions: sl.roster_positions,
        sleeperUserId:   sleeperUserId ?? null,
        lastSyncedAt:    new Date(),
    };

    // Respect Sleeper's season-rollover pattern (previous_league_id)
    let dbLeagueId: string | null = null;
    if (sl.previous_league_id) {
        const prior = await prisma.league.findFirst({
            where:  { userId, leagueId: sl.previous_league_id },
            select: { id: true },
        });
        if (prior) {
            const u = await prisma.league.update({
                where:  { id: prior.id },
                data:   fields,
                select: { id: true },
            });
            dbLeagueId = u.id;
        }
    }

    if (!dbLeagueId) {
        const r = await prisma.league.upsert({
            where:  { userId_platform_leagueId: { userId, platform: 'sleeper', leagueId: sl.league_id } },
            create: { userId, platform: 'sleeper', ...fields },
            update: fields,
            select: { id: true },
        });
        dbLeagueId = r.id;
    }

    // Propagate commissioner plan coverage to this member's League row.
    await applyCommissionerCoverage(dbLeagueId, invite.sleeperLeagueId);

    // ConnectedLeague entry tracks the verified invite for PRS and slot counting.
    const already = await prisma.connectedLeague.findFirst({
        where: { userId, leagueExtId: invite.sleeperLeagueId },
    });
    if (!already) {
        await prisma.connectedLeague.create({
            data: {
                userId,
                leagueName:  sl.name,
                platform:    'Sleeper',
                leagueExtId: invite.sleeperLeagueId,
            },
        });
        // New ConnectedLeague = new verified season for PRS — recalc async, don't block redirect.
        calculateAndSavePrs(userId).catch(err => console.error('[invite] calculateAndSavePrs failed', err));
    }

    return dbLeagueId;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    const invite = await prisma.leagueInvite.findUnique({
        where:  { token },
        select: { leagueName: true, season: true, sleeperLeagueId: true },
    });
    if (!invite) notFound();

    const session = await auth();

    if (session?.user?.id) {
        const dbUser = await prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { id: true, sleeperUserId: true },
        });

        if (dbUser) {
            // Fast path: league already in DB for this user
            const existing = await prisma.league.findFirst({
                where:  { userId: dbUser.id, leagueId: invite.sleeperLeagueId },
                select: { id: true },
            });

            // Ensure ConnectedLeague exists even on the fast path
            const connected = await prisma.connectedLeague.findFirst({
                where: { userId: dbUser.id, leagueExtId: invite.sleeperLeagueId },
            });
            if (!connected) {
                await prisma.connectedLeague.create({
                    data: {
                        userId:      dbUser.id,
                        leagueName:  invite.leagueName,
                        platform:    'Sleeper',
                        leagueExtId: invite.sleeperLeagueId,
                    },
                });
                calculateAndSavePrs(dbUser.id).catch(err => console.error('[invite] calculateAndSavePrs failed', err));
            }

            if (existing) {
                // Ensure commissioner coverage is set even on the fast path.
                await applyCommissionerCoverage(existing.id, invite.sleeperLeagueId);
                redirect(`/dashboard/league/${existing.id}/dues/pay`);
            }

            // Auto-accept: fetch from Sleeper, create records, redirect — no UI shown
            try {
                const leagueDbId = await acceptInvite(dbUser.id, dbUser.sleeperUserId, invite);
                redirect(`/dashboard/league/${leagueDbId}/dues/pay`);
            } catch {
                // Sleeper unreachable — fall back to sync page
                redirect(
                    `/dashboard/sync?invite=${token}&leagueId=${invite.sleeperLeagueId}&leagueName=${encodeURIComponent(invite.leagueName)}`,
                );
            }
        }
    }

    // Not logged in — redirect back through this invite page after auth
    const invitePath  = `/invite/${token}`;
    const signInHref  = `/sign-in?redirect=${encodeURIComponent(invitePath)}`;
    const signUpHref  = `/sign-up?redirect=${encodeURIComponent(invitePath)}`;

    return (
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="text-5xl">🏆</div>
                <div>
                    <p className="text-gray-500 text-sm uppercase tracking-widest mb-1">You&apos;re invited to</p>
                    <h1 className="text-3xl font-bold">{invite.leagueName}</h1>
                    <p className="text-gray-500 text-sm mt-1">{invite.season} Season</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3 text-left">
                    <p className="text-gray-300 text-sm leading-relaxed">
                        Your commissioner has invited you to track dues, payouts, standings, and trades for{' '}
                        <strong className="text-white">{invite.leagueName}</strong> on{' '}
                        <span className="text-[#D4AF37] font-semibold">FantasyiQ Trust</span>.
                    </p>
                    <ul className="space-y-1.5 text-gray-500 text-xs">
                        <li>✓ See who&apos;s paid dues and who hasn&apos;t</li>
                        <li>✓ View payout structure and standings</li>
                        <li>✓ Trade evaluator with dynasty player values</li>
                        <li>✓ League announcements from your commissioner</li>
                    </ul>
                </div>

                <div className="space-y-3">
                    <Link
                        href={signInHref}
                        className="block bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold py-3 px-6 rounded-xl transition text-sm"
                    >
                        Sign In to Get Started →
                    </Link>
                    <Link
                        href={signUpHref}
                        className="block bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition text-sm"
                    >
                        Create a Free Account
                    </Link>
                </div>

                <p className="text-gray-700 text-xs">
                    Sign in and you&apos;ll be taken directly into{' '}
                    <strong className="text-gray-600">{invite.leagueName}</strong>.
                </p>
            </div>
        </main>
    );
}
