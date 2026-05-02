export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getSafeSleeperLeague, getPlayers,
    summariseRosterPositions,
    type SleeperLeagueMember, type SleeperRoster,
} from '@/lib/sleeper';
import type { TeamRosterData } from '../RosterCards';
import { type StandingRow, type AnnouncementData, type SleeperSettings } from '../LeagueDetailTabs';
import type { DuesManagerData } from '../DuesManager';
import LeagueOverviewCards from '../LeagueOverviewCards';

const BENCH_SLOTS = new Set(['BN', 'IR']);

function fpts(r: SleeperRoster) {
    return (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
}

export default async function LeagueOverviewPage({
    params,
    searchParams,
}: {
    params:       Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { id } = await params;
    const sp = await searchParams;
    const showPlanModal                = sp.showPlanModal === '1';
    const showCommissionerPlanModal    = sp.showCommissionerPlanModal === '1';
    const duesPaid                     = sp.dues_paid === 'true';
    const duesCancelled                = sp.dues_cancelled === 'true';
    const payoutsRecorded              = sp.payouts_recorded === 'true';
    const payoutMarkedPaid             = sp.payout_marked_paid === 'true';
    const noPermissionManagePayouts    = sp.no_permission_manage_payouts === 'true';

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id: true, userId: true, leagueId: true, leagueName: true,
            season: true, totalRosters: true, scoringType: true,
            rosterPositions: true, sleeperUserId: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    const safeLeagueP = getSafeSleeperLeague(league.leagueId);
    const [allPlayers, dbUser, leagueDuesRecord, proBowlContest, leaguePayoutsRaw, leaguePayoutWinnersRaw] = await Promise.all([
        getPlayers(),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { sleeperUserId: true },
        }),
        prisma.leagueDues.findFirst({
            where: {
                leagueName: { equals: league.leagueName, mode: 'insensitive' },
                season:     league.season,
            },
            select: {
                id:              true,
                commissionerId:  true,
                buyInAmount:     true,
                collectedAmount: true,
                potTotal:        true,
                status:          true,
                teamCount:       true,
                payoutSpots: {
                    select:  { label: true, amount: true, sortOrder: true },
                    orderBy: { sortOrder: 'asc' },
                },
                winners: {
                    select:  { rank: true, teamName: true, displayName: true, amount: true, paidOut: true, paidAt: true },
                    orderBy: { rank: 'asc' },
                },
                members: {
                    select:  { id: true, userId: true, displayName: true, teamName: true, duesStatus: true, paymentMethod: true, stripeReceiptUrl: true },
                    orderBy: { displayName: 'asc' },
                },
                announcements: {
                    select: {
                        id: true, body: true, mediaUrl: true, pinned: true, createdAt: true,
                        author: { select: { name: true } },
                    },
                    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
                },
            },
        }),
        prisma.proBowlContest.findFirst({
            where:   { leagueId: league.id, isActive: true },
            select:  { id: true, name: true, openAt: true, lockAt: true, endAt: true },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.leaguePayout.findMany({
            where:   { leagueId: id },
            orderBy: { rank: 'asc' },
        }),
        prisma.leaguePayoutWinner.findMany({
            where:   { leagueId: id },
            orderBy: { rank: 'asc' },
        }),
    ]);

    const sleeperLeague = await safeLeagueP;
    const rosters       = sleeperLeague.rosters;
    const members       = sleeperLeague.users;
    const isDrafting    = sleeperLeague.isDrafting;

    // ── Derived data ──────────────────────────────────────────────────────────
    const memberMap = new Map<string, SleeperLeagueMember>(members.map(m => [m.user_id, m]));

    const rows = rosters
        .map(roster => {
            const member   = roster.owner_id ? memberMap.get(roster.owner_id) : undefined;
            const teamName = member?.metadata?.team_name || member?.display_name || `Team ${roster.roster_id}`;
            return { roster, member, teamName, wins: roster.settings?.wins ?? 0, losses: roster.settings?.losses ?? 0, ties: roster.settings?.ties ?? 0, fpts: fpts(roster) };
        })
        .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
        .map((row, i) => ({ ...row, rank: i + 1 }));

    const rosterPositions = (league.rosterPositions as string[]) ?? sleeperLeague.roster_positions ?? [];
    const starterSlots    = rosterPositions.filter(pos => !BENCH_SLOTS.has(pos));

    const neededIds = new Set<string>();
    for (const r of rosters) {
        for (const pid of r.players  ?? []) neededIds.add(pid);
        for (const pid of r.starters ?? []) neededIds.add(pid);
    }
    neededIds.delete('0');
    const players: Record<string, typeof allPlayers[string]> = {};
    for (const pid of neededIds) { if (allPlayers[pid]) players[pid] = allPlayers[pid]; }

    const teamRosters: TeamRosterData[] = rows.map(row => {
        const starterSet = new Set((row.roster.starters ?? []).filter(pid => pid !== '0'));
        const bench      = (row.roster.players ?? []).filter(pid => !starterSet.has(pid));
        return {
            rosterId:    row.roster.roster_id,
            rank:        row.rank,
            teamName:    row.teamName,
            username:    row.member?.username,
            avatar:      row.member?.avatar,
            wins:        row.wins,
            losses:      row.losses,
            ties:        row.ties,
            fpts:        row.fpts,
            starters:    row.roster.starters ?? [],
            bench,
            starterSlots,
        };
    });

    // ── Serialise ─────────────────────────────────────────────────────────────
    const sleeperSettings: SleeperSettings = {
        playoff_teams:  sleeperLeague.settings?.playoff_teams,
        type:           sleeperLeague.settings?.type,
        trade_deadline: sleeperLeague.settings?.trade_deadline,
    };

    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    const commissionerSleeperUserId = members.find(m => m.is_owner)?.user_id;
    const isCommissioner = !!commissionerSleeperUserId && !!mySleeperUserId &&
        String(commissionerSleeperUserId).trim() === String(mySleeperUserId).trim();

    const standingRows: StandingRow[] = rows.map(row => ({
        rosterId: row.roster.roster_id,
        rank:     row.rank,
        teamName: row.teamName,
        username: row.member?.username,
        avatar:   row.member?.avatar ?? null,
        wins:     row.wins,
        losses:   row.losses,
        ties:     row.ties,
        fpts:     row.fpts,
    }));

    const duesData: DuesManagerData | null = leagueDuesRecord ? {
        id:              leagueDuesRecord.id,
        buyInAmount:     leagueDuesRecord.buyInAmount,
        collectedAmount: leagueDuesRecord.collectedAmount,
        potTotal:        leagueDuesRecord.potTotal,
        status:          leagueDuesRecord.status,
        teamCount:       leagueDuesRecord.teamCount,
        payoutSpots:     leagueDuesRecord.payoutSpots,
        members:         leagueDuesRecord.members.map(m => ({
            id:            m.id,
            userId:        m.userId ?? null,
            displayName:   m.displayName,
            teamName:      m.teamName ?? null,
            duesStatus:    m.duesStatus,
            paymentMethod: m.paymentMethod ?? null,
            receiptUrl:    m.stripeReceiptUrl ?? null,
        })),
        winners: leagueDuesRecord.winners.map(w => ({
            rank:        w.rank,
            teamName:    w.teamName,
            displayName: w.displayName ?? null,
            amount:      w.amount,
            paidOut:     w.paidOut,
            paidAt:      w.paidAt?.toISOString() ?? null,
        })),
    } : null;

    // ── Merge new LeaguePayout + LeaguePayoutWinner records ──────────────────
    const payoutWinnerByRank = new Map(leaguePayoutWinnersRaw.map(w => [w.rank, w]));
    const leaguePayoutsData = leaguePayoutsRaw.length > 0
        ? leaguePayoutsRaw.map(p => ({
            rank:     p.rank,
            amount:   p.amount,
            teamName: payoutWinnerByRank.get(p.rank)?.teamName ?? '',
            paidAt:   p.paidAt?.toISOString() ?? null,
        }))
        : null;

    const announcements: AnnouncementData[] = (leagueDuesRecord?.announcements ?? []).map(a => ({
        id:         a.id,
        body:       a.body,
        mediaUrl:   a.mediaUrl ?? null,
        pinned:     a.pinned,
        createdAt:  a.createdAt.toISOString(),
        authorName: a.author.name ?? null,
    }));

    return (
        <>
        {showCommissionerPlanModal && (
            <div className="rounded-xl bg-[#C8A951]/10 border border-[#C8A951]/30 px-5 py-4 mb-4 flex items-center justify-between gap-4">
                <div>
                    <p className="text-[#C8A951] font-semibold text-sm">You&apos;re the commissioner — choose a plan to unlock the full toolkit</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                        Dues management, member invites, announcements, and payouts are included with a commissioner plan.
                    </p>
                </div>
                <a href="/pricing?tab=commissioner" className="shrink-0 bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-4 py-2 rounded-lg transition text-xs whitespace-nowrap">
                    View Commissioner Plans
                </a>
            </div>
        )}
        {showPlanModal && (
            <div className="rounded-xl bg-[#C8A951]/10 border border-[#C8A951]/30 px-5 py-4 mb-4 flex items-center justify-between gap-4">
                <div>
                    <p className="text-[#C8A951] font-semibold text-sm">League synced — add it to a plan to unlock features</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                        Standings and rosters are always free. Trade evaluator, rankings, and dues management require a plan.
                    </p>
                </div>
                <a href="/pricing?tab=player" className="shrink-0 bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-4 py-2 rounded-lg transition text-xs">
                    View Plans
                </a>
            </div>
        )}
        {duesPaid && (
            <div className="rounded-xl bg-green-900/20 border border-green-700/50 px-5 py-4 mb-4 flex items-center gap-3">
                <span className="text-green-400 text-lg">✓</span>
                <div>
                    <p className="text-green-400 font-semibold text-sm">Dues paid — you&apos;re all set!</p>
                    <p className="text-gray-400 text-xs mt-0.5">Your payment was received and your status has been updated.</p>
                </div>
            </div>
        )}
        {duesCancelled && (
            <div className="rounded-xl bg-gray-800/60 border border-gray-700 px-5 py-4 mb-4 flex items-center gap-3">
                <span className="text-gray-400 text-lg">✕</span>
                <p className="text-gray-400 text-sm">Payment cancelled — no charge was made. You can pay when you&apos;re ready.</p>
            </div>
        )}
        {payoutsRecorded && (
            <div className="rounded-xl bg-[#0F3D2E] border border-emerald-700/50 px-5 py-4 mb-4 flex items-center gap-3">
                <span className="text-emerald-400 text-lg">🏆</span>
                <div>
                    <p className="text-emerald-400 font-semibold text-sm">Payouts recorded — winners will be paid.</p>
                    <p className="text-gray-400 text-xs mt-0.5">The payout breakdown is now visible to all league members.</p>
                </div>
            </div>
        )}
        {payoutMarkedPaid && (
            <div className="rounded-xl bg-[#0F3D2E] border border-emerald-700/50 px-5 py-4 mb-4 flex items-center gap-3">
                <span className="text-emerald-400 text-lg">✓</span>
                <p className="text-emerald-400 font-semibold text-sm">Payout marked as paid.</p>
            </div>
        )}
        {noPermissionManagePayouts && (
            <div className="rounded-xl bg-gray-800/60 border border-gray-700 px-5 py-4 mb-4 flex items-center gap-3">
                <span className="text-gray-400 text-lg">🔒</span>
                <p className="text-gray-400 text-sm">Only the league commissioner can manage payouts.</p>
            </div>
        )}
        {isDrafting && (
            <div className="rounded-md bg-yellow-100 border border-yellow-300 p-3 text-yellow-900 mb-4 text-sm">
                This league is currently drafting. Sleeper may return incomplete data — picks and team names are shown using fallback mode.
            </div>
        )}
        <LeagueOverviewCards
            leagueId={id}
            leagueName={league.leagueName}
            season={league.season}
            scoringType={league.scoringType ?? null}
            totalRosters={league.totalRosters}
            standingRows={standingRows}
            hasTies={rows.some(r => r.ties > 0)}
            hasPA={rows.some(r => r.fpts > 0)}
            teamRosters={teamRosters}
            players={players}
            rosterPositions={rosterPositions}
            rosterPositionsSummary={summariseRosterPositions(rosterPositions)}
            sleeperSettings={sleeperSettings}
            duesData={duesData}
            announcements={announcements}
            proBowlContest={proBowlContest ? {
                id:     proBowlContest.id,
                name:   proBowlContest.name,
                openAt: proBowlContest.openAt.toISOString(),
                lockAt: proBowlContest.lockAt.toISOString(),
                endAt:  proBowlContest.endAt.toISOString(),
            } : null}
            isCommissioner={isCommissioner}
            currentUserId={session.user.id}
            leaguePayouts={leaguePayoutsData}
        />
        </>
    );
}
