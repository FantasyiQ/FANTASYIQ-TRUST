import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// ── Access control ────────────────────────────────────────────────────────────
// Allow only when DEV_RESET_ENABLED=true AND the caller is the owner account.
// Never runs on production unless explicitly opted in.

const ALLOWED_USER_IDS = (process.env.DEV_RESET_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

function isAllowed(userId: string): boolean {
    if (process.env.DEV_RESET_ENABLED !== 'true') return false;
    // If no specific IDs listed, allow any authenticated user (useful for solo dev accounts)
    if (ALLOWED_USER_IDS.length === 0) return true;
    return ALLOWED_USER_IDS.includes(userId);
}

// POST /api/admin/reset-test-data
export async function POST(_req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    if (!isAllowed(userId)) {
        return NextResponse.json(
            { error: 'Reset not enabled. Set DEV_RESET_ENABLED=true in your environment.' },
            { status: 403 },
        );
    }

    // ── 1. Capture IDs before deletion ───────────────────────────────────────
    const [userLeagues, userLeagueDues] = await Promise.all([
        prisma.league.findMany({
            where:  { userId },
            select: { id: true, leagueId: true }, // leagueId = Sleeper external ID
        }),
        prisma.leagueDues.findMany({
            where:  { commissionerId: userId },
            select: { id: true },
        }),
    ]);

    const dbLeagueIds     = userLeagues.map(l => l.id);
    const sleeperLeagueIds = userLeagues.map(l => l.leagueId);
    const leagueDuesIds   = userLeagueDues.map(d => d.id);

    // ── 2. Delete in FK-safe order ────────────────────────────────────────────
    // Leaf → parent. Many tables cascade automatically, but explicit is safer.

    // --- LeagueDues tree (all cascade from LeagueDues) ---
    // PollVote → LeaguePoll (both cascade from DuesMember / LeagueDues)
    // PayoutProposalItem → PayoutProposal → LeaguePoll
    // FutureDuesObligation, LeagueDocument, Announcement, DuesMember, PayoutSpot, LeagueWinner
    // Just delete LeagueDues and cascade handles it:
    if (leagueDuesIds.length > 0) {
        await prisma.leagueDues.deleteMany({ where: { id: { in: leagueDuesIds } } });
    }

    // Also wipe DuesMember rows where this user appears as a *member* (not commissioner)
    await prisma.duesMember.deleteMany({ where: { userId } });

    // --- League tree (LeaguePayout, LeaguePayoutWinner, LeagueCalendarEvent all cascade) ---
    if (dbLeagueIds.length > 0) {
        await prisma.league.deleteMany({ where: { id: { in: dbLeagueIds } } });
    }

    // --- PowerRankingSnapshot uses Sleeper external leagueId (no FK, no cascade) ---
    if (sleeperLeagueIds.length > 0) {
        await prisma.powerRankingSnapshot.deleteMany({
            where: { leagueId: { in: sleeperLeagueIds } },
        });
    }

    // --- ConnectedLeague (legacy table, userId FK) ---
    await prisma.connectedLeague.deleteMany({ where: { userId } });

    // --- LeagueInvite (createdById FK, cascades from User but delete explicitly) ---
    await prisma.leagueInvite.deleteMany({ where: { createdById: userId } });

    return NextResponse.json({ ok: true, cleared: { leagues: dbLeagueIds.length, dues: leagueDuesIds.length } });
}
