import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueUsers } from '@/lib/sleeper';

export type LeagueDuesData = {
    league: {
        id:           string;
        leagueName:   string;
        season:       string;
        totalRosters: number;
        leagueId:     string;
    };
    duesId:        string | null;
    buyInAmount:   number;
    isCommissioner: boolean;
    currentUserId: string;
    pot: {
        total:      number;
        full:       number;
        progress:   number;
        paidCount:  number;
        unpaidCount: number;
    } | null;
    payments: {
        stripe: { count: number; total: number };
        manual: { count: number; total: number };
    } | null;
    members: {
        id:            string;
        userId:        string | null;
        displayName:   string;
        teamName:      string | null;
        duesStatus:    string;
        paymentMethod: string | null;
    }[];
    payouts: { id: string; label: string; amount: number }[];
};

export async function getLeagueDues(id: string): Promise<LeagueDuesData> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: { id: true, userId: true, leagueId: true, leagueName: true, season: true, totalRosters: true, sleeperUserId: true },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { sleeperUserId: true },
        }),
    ]);

    if (!league || league.userId !== session.user.id) notFound();

    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;

    const dues = await prisma.leagueDues.findFirst({
        where: {
            leagueName: { equals: league.leagueName, mode: 'insensitive' },
            season:     league.season,
        },
        select: {
            id:              true,
            commissionerId:  true,
            buyInAmount:     true,
            teamCount:       true,
            members: {
                orderBy: { displayName: 'asc' },
                select:  { id: true, userId: true, displayName: true, teamName: true, duesStatus: true, paymentMethod: true },
            },
            payoutSpots: {
                orderBy: { sortOrder: 'asc' },
                select:  { id: true, label: true, amount: true },
            },
        },
    });

    // Commissioner check
    let isCommissioner = dues?.commissionerId === session.user.id;
    if (!isCommissioner && mySleeperUserId) {
        try {
            const members    = await getLeagueUsers(league.leagueId);
            const commId     = members.find(m => m.is_owner)?.user_id;
            isCommissioner   = !!commId && String(commId).trim() === String(mySleeperUserId).trim();
        } catch { /* Sleeper unreachable */ }
    }

    if (!dues) {
        return {
            league:        { id: league.id, leagueName: league.leagueName, season: league.season, totalRosters: league.totalRosters, leagueId: league.leagueId },
            duesId:        null,
            buyInAmount:   0,
            isCommissioner,
            currentUserId: session.user.id,
            pot:           null,
            payments:      null,
            members:       [],
            payouts:       [],
        };
    }

    const fullPot    = dues.buyInAmount * dues.teamCount;
    const paidCount  = dues.members.filter(m => m.duesStatus === 'paid').length;
    const potTotal   = dues.members.filter(m => m.duesStatus === 'paid').length * dues.buyInAmount;
    const stripePaid = dues.members.filter(m => m.duesStatus === 'paid' && (m.paymentMethod === 'stripe_direct' || m.paymentMethod === 'stripe_on_behalf'));
    const manualPaid = dues.members.filter(m => m.duesStatus === 'paid' && m.paymentMethod === 'manual');

    return {
        league:        { id: league.id, leagueName: league.leagueName, season: league.season, totalRosters: league.totalRosters, leagueId: league.leagueId },
        duesId:        dues.id,
        buyInAmount:   dues.buyInAmount,
        isCommissioner,
        currentUserId: session.user.id,
        pot: {
            total:       potTotal,
            full:        fullPot,
            progress:    fullPot > 0 ? Math.min(100, Math.round((potTotal / fullPot) * 100)) : 0,
            paidCount,
            unpaidCount: dues.members.filter(m => m.duesStatus === 'unpaid').length,
        },
        payments: {
            stripe: { count: stripePaid.length, total: stripePaid.length * dues.buyInAmount },
            manual: { count: manualPaid.length, total: manualPaid.length * dues.buyInAmount },
        },
        members: dues.members.map(m => ({
            id:            m.id,
            userId:        m.userId ?? null,
            displayName:   m.displayName,
            teamName:      m.teamName ?? null,
            duesStatus:    m.duesStatus,
            paymentMethod: m.paymentMethod ?? null,
        })),
        payouts: dues.payoutSpots,
    };
}
