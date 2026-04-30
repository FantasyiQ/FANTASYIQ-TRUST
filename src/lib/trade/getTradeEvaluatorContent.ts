import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getLeague, getLeagueRosters, getPlayers, getTradedPicks,
    getLeagueDrafts, buildPickOwnerMap, buildRosterSlotMap,
} from '@/lib/sleeper';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import { stripe, priceIdToTier } from '@/lib/stripe';
import type { SubscriptionTier } from '@prisma/client';
import type { LeagueType } from '@/lib/trade-engine';

export type TradeEvaluatorContent = {
    leagueName:          string;
    scoringType:         string | null;
    totalRosters:        number;
    draftRounds:         number;
    draftOrderProjected: boolean;
    leagueType:          LeagueType;
    rosterPositions:     string[];
    scoringSettings:     Record<string, number>;
    myTeamData?: {
        rosterId:   number;
        teamName:   string;
        players:    { name: string; position: string; team: string }[];
        ownedPicks: { season: string; round: number; slot?: number; tier?: string; tierProjected?: boolean; origTeamName?: string }[];
    };
    otherTeamsData: {
        rosterId:   number;
        teamName:   string;
        players:    { name: string; position: string; team: string }[];
        ownedPicks: { season: string; round: number; slot?: number; tier?: string; tierProjected?: boolean; origTeamName?: string }[];
    }[];
};

export async function getTradeEvaluatorContent(id: string): Promise<TradeEvaluatorContent> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: { id: true, userId: true, leagueId: true, leagueName: true, scoringType: true, totalRosters: true, rosterPositions: true, sleeperUserId: true },
    });
    if (!league || league.userId !== session.user.id) notFound();

    const [sleeperLeague, rosters, allPlayers, tradedPicks, drafts, dbUser] = await Promise.all([
        getLeague(league.leagueId),
        getLeagueRosters(league.leagueId),
        getPlayers(),
        getTradedPicks(league.leagueId),
        getLeagueDrafts(league.leagueId),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: {
                sleeperUserId:    true,
                connectedLeagues: { select: { leagueName: true } },
                subscriptions: {
                    where:   { status: { in: ['active', 'trialing'] } },
                    orderBy: { createdAt: 'desc' },
                    select:  { id: true, type: true, tier: true, leagueName: true, stripeSubscriptionId: true },
                },
                leagues: { select: { id: true, leagueName: true } },
            },
        }),
    ]);

    // ── Tier gate ─────────────────────────────────────────────────────────────
    const activePlayerSub = dbUser?.subscriptions.find(s => s.type === 'player') ?? null;
    let playerTier = activePlayerSub?.tier ?? 'FREE';
    if (activePlayerSub?.stripeSubscriptionId) {
        try {
            const stripeSub      = await stripe.subscriptions.retrieve(activePlayerSub.stripeSubscriptionId);
            const currentPriceId = stripeSub.items.data[0]?.price.id;
            const stripeTier     = currentPriceId ? priceIdToTier(currentPriceId) : null;
            if (stripeTier) {
                playerTier = stripeTier;
                if (stripeTier !== activePlayerSub.tier) {
                    prisma.subscription.update({
                        where: { id: activePlayerSub.id },
                        data:  { tier: stripeTier as unknown as SubscriptionTier },
                    }).catch(() => {});
                }
            }
        } catch { /* fall back to DB */ }
    }

    const commSub = await prisma.subscription.findFirst({
        where:   { type: 'commissioner', leagueName: { equals: league.leagueName, mode: 'insensitive' }, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
        select:  { tier: true },
    });

    const syncedNameToId   = new Map((dbUser?.leagues ?? []).map(l => [l.leagueName.toLowerCase().trim(), l.id]));
    const leagueConnected  = (dbUser?.connectedLeagues ?? []).some(cl => {
        if (cl.leagueName.toLowerCase().trim() === league.leagueName.toLowerCase().trim()) return true;
        return syncedNameToId.get(cl.leagueName.toLowerCase().trim()) === league.id;
    });
    const effectiveTier       = effectiveTierForLeague(playerTier, commSub?.tier ?? null, leagueConnected);
    if (tierLevel(effectiveTier) < 2) notFound();

    // ── Build pick data ───────────────────────────────────────────────────────
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    const rosterPositions = (league.rosterPositions as string[]) ?? sleeperLeague.roster_positions ?? [];
    const leagueType: LeagueType = sleeperLeague.settings?.type === 2 ? 'Dynasty' : 'Redraft';
    const draftRounds    = sleeperLeague.settings?.draft_rounds ?? 5;

    const _now       = new Date();
    const _pastDraft = _now.getMonth() + 1 > 4 || (_now.getMonth() + 1 === 4 && _now.getDate() >= 25);
    const _base      = _pastDraft ? _now.getFullYear() + 1 : _now.getFullYear();
    const FUTURE_SEASONS = [String(_base), String(_base + 1), String(_base + 2)];
    const ROUNDS         = Array.from({ length: draftRounds }, (_, i) => i + 1);
    const rosterIds      = rosters.map(r => r.roster_id);

    const rows = rosters
        .map(r => {
            const fpts = (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
            return { roster: r, teamName: `Team ${r.roster_id}`, wins: r.settings?.wins ?? 0, fpts };
        })
        .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
        .map((row, i) => ({ ...row, rank: i + 1 }));

    const standingsRank = new Map(rows.map(row => [row.roster.roster_id, row.rank]));
    const draft         = drafts[0] ?? null;
    const { projected: draftOrderProjected } = buildRosterSlotMap(rosters, draft, standingsRank, league.totalRosters);

    const currentAllZero    = rosters.every(r => (r.settings?.wins ?? 0) === 0 && (r.settings?.losses ?? 0) === 0);
    const prevSeasonRosters = (currentAllZero && sleeperLeague.previous_league_id)
        ? await getLeagueRosters(sleeperLeague.previous_league_id)
        : undefined;

    const pickOwnerMap = buildPickOwnerMap(rosters, tradedPicks, FUTURE_SEASONS, drafts, draftRounds, prevSeasonRosters);

    function computeOwnedPicks(rosterId: number) {
        const owned: { season: string; round: number; slot?: number; tier?: string; tierProjected?: boolean; origTeamName?: string }[] = [];
        for (const season of FUTURE_SEASONS) {
            for (const round of ROUNDS) {
                for (const origId of rosterIds) {
                    const key   = `${season}-${round}-${origId}`;
                    const entry = pickOwnerMap.get(key);
                    if (!entry || Number(entry.owner) !== Number(rosterId)) continue;
                    const traded       = origId !== rosterId;
                    const origTeamName = traded ? rows.find(r => r.roster.roster_id === origId)?.teamName : undefined;
                    owned.push({ season, round, slot: entry.slot, tier: entry.tier, tierProjected: entry.tierProjected, origTeamName });
                }
            }
        }
        return owned;
    }

    const teamTradeData = rows.map(row => ({
        rosterId:   row.roster.roster_id,
        teamName:   row.teamName,
        players:    (row.roster.players ?? [])
            .filter(pid => pid !== '0' && allPlayers[pid])
            .map(pid => ({ name: allPlayers[pid].full_name, position: allPlayers[pid].position, team: allPlayers[pid].team })),
        ownedPicks: computeOwnedPicks(row.roster.roster_id),
    }));

    const myTeamData     = mySleeperUserId
        ? teamTradeData.find(t => rosters.find(r => r.roster_id === t.rosterId)?.owner_id === mySleeperUserId)
        : undefined;
    const otherTeamsData = teamTradeData.filter(t => t.rosterId !== myTeamData?.rosterId);

    return {
        leagueName:          league.leagueName,
        scoringType:         league.scoringType ?? null,
        totalRosters:        league.totalRosters,
        draftRounds,
        draftOrderProjected,
        leagueType,
        rosterPositions,
        scoringSettings:     (sleeperLeague.scoring_settings as Record<string, number>) ?? {},
        myTeamData,
        otherTeamsData,
    };
}
