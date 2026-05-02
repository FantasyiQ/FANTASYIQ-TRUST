export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSafeSleeperLeague } from '@/lib/sleeper';
import PayoutsManagerForm from './PayoutsManagerForm';

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
        },
    });

    if (!league || league.userId !== session.user.id) {
        redirect(`/dashboard/league/${id}/overview?no_permission_manage_payouts=true`);
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
    const mySleeperUserId       = dbUser?.sleeperUserId ?? league.sleeperUserId;
    const commissionerSleeperId = sleeperLeague.users.find(m => m.is_owner)?.user_id;
    const isCommissioner        =
        !!commissionerSleeperId && !!mySleeperUserId &&
        String(commissionerSleeperId).trim() === String(mySleeperUserId).trim();

    if (!isCommissioner) {
        redirect(`/dashboard/league/${id}/overview?no_permission_manage_payouts=true`);
    }

    // ── Build teams list from Sleeper rosters ─────────────────────────────────
    const memberMap = new Map(sleeperLeague.users.map(m => [m.user_id, m]));
    const teams = sleeperLeague.rosters
        .filter(r => r.owner_id)
        .map(r => {
            const member = r.owner_id ? memberMap.get(r.owner_id) : undefined;
            return {
                id:   String(r.roster_id),
                name: member?.metadata?.team_name || member?.display_name || `Team ${r.roster_id}`,
            };
        })
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
    const winnerByRank  = new Map(existingWinners.map(w => [w.rank, w]));
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

    return (
        <PayoutsManagerForm
            leagueId={id}
            leagueName={league.leagueName}
            potTotal={potTotal}
            teams={teams}
            defaultSpots={defaultSpots}
            existingPayouts={existingCombined}
            seasonComplete={seasonComplete}
        />
    );
}
