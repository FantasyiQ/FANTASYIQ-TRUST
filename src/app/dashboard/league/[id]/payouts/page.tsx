export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSafeSleeperLeague } from '@/lib/sleeper';
import PayoutsManagerForm from './PayoutsManagerForm';

function fpts(settings: { fpts: number; fpts_decimal?: number } | null | undefined): number {
    if (!settings) return 0;
    return settings.fpts + (settings.fpts_decimal ?? 0) / 100;
}

export default async function PayoutsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id:            true,
            userId:        true,
            leagueId:      true,
            leagueName:    true,
            season:        true,
            sleeperUserId: true,
            platform:      true,
            standings:     true,
        },
    });

    if (!league || league.userId !== session.user.id) {
        redirect(`/dashboard/league/${id}/overview?no_permission_manage_payouts=true`);
    }

    // ── ESPN branch: use stored DB standings, skip Sleeper ───────────────────
    if (league.platform === 'espn') {
        type EspnStandingRow = { teamId: number; name: string; wins: number; losses: number; ties: number; fpts: number };
        const espnTeams = (league.standings as EspnStandingRow[] | null) ?? [];

        const [leagueDues, existingPayouts, existingWinners] = await Promise.all([
            prisma.leagueDues.findFirst({
                where: { leagueName: { equals: league.leagueName, mode: 'insensitive' }, season: league.season },
                select: {
                    potTotal:    true,
                    payoutSpots: { select: { label: true, amount: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
                },
            }),
            prisma.leaguePayout.findMany({ where: { leagueId: id }, orderBy: { rank: 'asc' } }),
            prisma.leaguePayoutWinner.findMany({ where: { leagueId: id }, orderBy: { rank: 'asc' } }),
        ]);

        const teams = espnTeams.map(t => ({ id: String(t.teamId), name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
        const defaultSpots = leagueDues && leagueDues.payoutSpots.length > 0
            ? leagueDues.payoutSpots.map((s, i) => ({ rank: i + 1, label: s.label, amount: s.amount }))
            : [{ rank: 1, label: '1st Place', amount: 0 }, { rank: 2, label: '2nd Place', amount: 0 }, { rank: 3, label: '3rd Place', amount: 0 }];
        const potTotal = leagueDues?.potTotal ?? 0;
        const winnerByRank = new Map(existingWinners.map(w => [w.rank, w]));
        const existingCombined = existingPayouts.length > 0
            ? existingPayouts.map(p => ({ rank: p.rank, amount: p.amount, teamId: winnerByRank.get(p.rank)?.teamId ?? '', teamName: winnerByRank.get(p.rank)?.teamName ?? '', paidAt: p.paidAt?.toISOString() ?? null }))
            : null;
        const seasonComplete = league.season !== String(new Date().getFullYear());
        const autoDetectedWinners = seasonComplete && !existingCombined
            ? [...espnTeams].sort((a, b) => b.wins - a.wins || b.fpts - a.fpts).slice(0, defaultSpots.length).map((t, i) => ({ rank: i + 1, teamId: String(t.teamId), teamName: t.name }))
            : null;

        return (
            <PayoutsManagerForm
                leagueId={id}
                leagueName={league.leagueName}
                potTotal={potTotal}
                teams={teams}
                defaultSpots={defaultSpots}
                existingPayouts={existingCombined}
                seasonComplete={seasonComplete}
                autoDetectedWinners={autoDetectedWinners}
            />
        );
    }

    // ── Fetch Sleeper data + DB data in parallel ──────────────────────────────
    const [sleeperLeague, dbUser, leagueDues, existingPayouts, existingWinners] =
        await Promise.all([
            getSafeSleeperLeague(league.leagueId),
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
                    potTotal:    true,
                    payoutSpots: {
                        select:  { label: true, amount: true, sortOrder: true },
                        orderBy: { sortOrder: 'asc' },
                    },
                },
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

    // ── Commissioner check via Sleeper is_owner ───────────────────────────────
    // Use .some() — both primary commissioner and co-commissioners have is_owner: true.
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId;
    const isCommissioner  = !!mySleeperUserId && sleeperLeague.users.some(
        m => m.is_owner && String(m.user_id).trim() === String(mySleeperUserId).trim()
    );

    if (!isCommissioner) {
        redirect(`/dashboard/league/${id}/overview?no_permission_manage_payouts=true`);
    }

    // ── Build teams list from Sleeper rosters ─────────────────────────────────
    const memberMap = new Map(sleeperLeague.users.map(m => [m.user_id, m]));

    function teamName(rosterId: number, ownerId: string | null): string {
        const member = ownerId ? memberMap.get(ownerId) : undefined;
        return member?.metadata?.team_name || member?.display_name || `Team ${rosterId}`;
    }

    const teams = sleeperLeague.rosters
        .filter(r => r.owner_id)
        .map(r => ({
            id:   String(r.roster_id),
            name: teamName(r.roster_id, r.owner_id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    // ── Default payout spots (from LeagueDues or fallback 3-place) ────────────
    const defaultSpots: { rank: number; label: string; amount: number }[] =
        leagueDues && leagueDues.payoutSpots.length > 0
            ? leagueDues.payoutSpots.map((s, i) => ({
                rank:   i + 1,
                label:  s.label,
                amount: s.amount,
            }))
            : [
                { rank: 1, label: '1st Place', amount: 0 },
                { rank: 2, label: '2nd Place', amount: 0 },
                { rank: 3, label: '3rd Place', amount: 0 },
            ];

    const potTotal = leagueDues?.potTotal ?? 0;

    // ── Merge existing payouts + winners ──────────────────────────────────────
    const winnerByRank     = new Map(existingWinners.map(w => [w.rank, w]));
    const existingCombined = existingPayouts.length > 0
        ? existingPayouts.map(p => ({
            rank:     p.rank,
            amount:   p.amount,
            teamId:   winnerByRank.get(p.rank)?.teamId   ?? '',
            teamName: winnerByRank.get(p.rank)?.teamName ?? '',
            paidAt:   p.paidAt?.toISOString() ?? null,
        }))
        : null;

    const seasonComplete = league.season !== String(new Date().getFullYear());

    // ── Auto-detect winners from Sleeper standings (if no existing payouts) ───
    const autoDetectedWinners: { rank: number; teamId: string; teamName: string }[] | null =
        seasonComplete && !existingCombined
            ? sleeperLeague.rosters
                .filter(r => r.owner_id)
                .map(r => ({
                    rosterId: r.roster_id,
                    ownerId:  r.owner_id!,
                    wins:     r.settings?.wins  ?? 0,
                    losses:   r.settings?.losses ?? 0,
                    fp:       fpts(r.settings),
                }))
                .sort((a, b) => b.wins - a.wins || b.fp - a.fp)
                .slice(0, defaultSpots.length)
                .map((r, i) => ({
                    rank:     i + 1,
                    teamId:   String(r.rosterId),
                    teamName: teamName(r.rosterId, r.ownerId),
                }))
            : null;

    return (
        <PayoutsManagerForm
            leagueId={id}
            leagueName={league.leagueName}
            potTotal={potTotal}
            teams={teams}
            defaultSpots={defaultSpots}
            existingPayouts={existingCombined}
            seasonComplete={seasonComplete}
            autoDetectedWinners={autoDetectedWinners}
        />
    );
}
