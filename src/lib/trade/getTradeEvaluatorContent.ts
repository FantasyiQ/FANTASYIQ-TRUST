import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getSafeSleeperLeague, getLeagueRosters, getPlayers, getTradedPicks,
    getDraftPickCount, buildPickOwnerMap, buildRosterSlotMap,
} from '@/lib/sleeper';
import { getPickSeasons } from '@/lib/fantasy/getPickSeasons';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import { stripe, priceIdToTier } from '@/lib/stripe';
import type { SubscriptionTier } from '@prisma/client';
import type { LeagueType } from '@/lib/trade-engine';
import { buildLeagueConfig } from '@/lib/rankings/leagueConfigBuilder';
import { buildLeagueDefensiveAndKickerRankings } from '@/lib/rankings/defensiveEngine';
import { buildIdpSeedProjections, buildKickerSeedProjections, buildDefenseSeedProjections, toIdpPosition } from '@/lib/rankings/seedProjections';
import { buildProjectionsFromSleeperStats } from '@/lib/rankings/sleeperStatsAdapter';

export type TradeEvaluatorContent = {
    leagueName:          string;
    scoringType:         string | null;
    totalRosters:        number;
    draftRounds:         number;
    draftOrderProjected: boolean;
    leagueType:          LeagueType;
    rosterPositions:     string[];
    scoringSettings:     Record<string, number>;
    sleeperLeagueId:     string;
    mySleeperUserId:     string | null;
    /**
     * Defensive value scores (0–100) keyed by player name, from the defensive
     * ranking engine. Empty when the league has no IDP/K/DEF positions.
     */
    defenseValues:       Record<string, number>;
    myTeamData?: {
        rosterId:   number;
        teamName:   string;
        players:    { id: string; name: string; position: string; team: string }[];
        ownedPicks: { season: string; round: number; slot?: number; tier?: string; tierProjected?: boolean; origTeamName?: string }[];
    };
    otherTeamsData: {
        rosterId:   number;
        teamName:   string;
        players:    { id: string; name: string; position: string; team: string }[];
        ownedPicks: { season: string; round: number; slot?: number; tier?: string; tierProjected?: boolean; origTeamName?: string }[];
    }[];
};

export async function getTradeEvaluatorContent(id: string): Promise<TradeEvaluatorContent> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: { id: true, userId: true, leagueId: true, leagueName: true, scoringType: true, totalRosters: true, rosterPositions: true, sleeperUserId: true, platform: true },
    });
    if (!league || league.userId !== session.user.id) notFound();

    // Trade evaluator requires Sleeper roster data — ESPN leagues not supported
    if (league.platform === 'espn') redirect(`/dashboard/league/${id}/overview`);

    const safeLeagueP = getSafeSleeperLeague(league.leagueId);
    const [allPlayers, tradedPicks, dbUser] = await Promise.all([
        getPlayers(),
        getTradedPicks(league.leagueId),
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
    const sleeperLeague = await safeLeagueP;
    const safeRosters   = sleeperLeague.rosters;
    const members       = sleeperLeague.users;
    const drafts        = sleeperLeague.drafts;
    const isDrafting    = sleeperLeague.isDrafting;
    const memberMap     = new Map(members.map(m => [m.user_id, m]));

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
    const draftRounds    = sleeperLeague.settings.draft_rounds;

    const leagueSeason   = Number(sleeperLeague.season);
    const currentDraft   = drafts.find(d => d.season === sleeperLeague.season) ?? null;
    const hasDraft       = currentDraft !== null;
    const draftCompleted = !isDrafting
        && !!currentDraft
        && leagueSeason <= new Date().getFullYear()
        && currentDraft.status === 'complete'
        && (await getDraftPickCount(currentDraft.draft_id)) > 0;
    const FUTURE_SEASONS = getPickSeasons({ leagueSeason, hasDraft, draftCompleted, isDrafting });
    const ROUNDS         = Array.from({ length: draftRounds }, (_, i) => i + 1);
    const rosterIds      = safeRosters.map(r => r.roster_id);

    const rows = safeRosters
        .map(r => {
            const fpts   = (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
            const member = r.owner_id ? memberMap.get(r.owner_id) : undefined;
            const teamName = member?.metadata?.team_name || member?.display_name || `Team ${r.roster_id}`;
            return { roster: r, teamName, wins: r.settings?.wins ?? 0, fpts };
        })
        .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
        .map((row, i) => ({ ...row, rank: i + 1 }));

    const standingsRank = new Map(rows.map(row => [row.roster.roster_id, row.rank]));
    const draft         = drafts[0] ?? null;
    const { projected: draftOrderProjected } = buildRosterSlotMap(safeRosters, draft, standingsRank, league.totalRosters);

    const currentAllZero    = safeRosters.every(r => (r.settings?.wins ?? 0) === 0 && (r.settings?.losses ?? 0) === 0);
    const prevSeasonRosters = (currentAllZero && sleeperLeague.previous_league_id)
        ? await getLeagueRosters(sleeperLeague.previous_league_id)
        : undefined;

    const pickOwnerMap = buildPickOwnerMap(safeRosters, tradedPicks, FUTURE_SEASONS, drafts, draftRounds, prevSeasonRosters);

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
            .map(pid => ({ id: pid, name: allPlayers[pid].full_name, position: allPlayers[pid].position, team: allPlayers[pid].team })),
        ownedPicks: computeOwnedPicks(row.roster.roster_id),
    }));

    const myTeamData     = mySleeperUserId
        ? teamTradeData.find(t => safeRosters.find(r => r.roster_id === t.rosterId)?.owner_id === mySleeperUserId)
        : undefined;
    const otherTeamsData = teamTradeData.filter(t => t.rosterId !== myTeamData?.rosterId);

    // ── Defensive ranking engine ───────────────────────────────────────────────
    // Build league config from Sleeper data, run the defensive engine with
    // seed projections (NFL population averages), and return value scores
    // keyed by player name for the unified trade evaluator.
    const rawScoringSettings = (sleeperLeague.scoring_settings as Record<string, number>) ?? {};
    const { scoring, lineup } = buildLeagueConfig(
        rawScoringSettings,
        rosterPositions,
        league.totalRosters,
    );

    let defenseValues: Record<string, number> = {};
    const anyDefensiveSlots =
        lineup.starters.DL > 0 || lineup.starters.LB > 0 || lineup.starters.DB > 0 ||
        lineup.starters.IDP > 0 || lineup.starters.K > 0 || lineup.starters.DEF > 0;

    if (anyDefensiveSlots) {
        // Bucket roster players by their defensive position using the players map.
        const idpPlayers: { playerId: string; position: 'DL' | 'LB' | 'DB' }[] = [];
        const kickerIds:  string[] = [];

        for (const [pid, player] of Object.entries(allPlayers)) {
            const idpPos = toIdpPosition(player.position);
            if (idpPos) {
                idpPlayers.push({ playerId: pid, position: idpPos });
            } else if (player.position === 'K') {
                kickerIds.push(pid);
            }
        }

        const liveProjections    = await buildProjectionsFromSleeperStats('2025', allPlayers, rawScoringSettings);
        const idpProjections     = liveProjections?.idpProjections     ?? buildIdpSeedProjections(idpPlayers);
        const kickerProjections  = liveProjections?.kickerProjections  ?? buildKickerSeedProjections(kickerIds);
        const defenseProjections = liveProjections?.defenseProjections ?? buildDefenseSeedProjections();

        const rankings = buildLeagueDefensiveAndKickerRankings(
            scoring,
            lineup,
            idpProjections,
            kickerProjections,
            defenseProjections,
            leagueType,
            liveProjections?.offensiveTop5Avg ?? {},
        );

        // Store by Sleeper player ID — unified evaluator does ID-keyed lookup.
        for (const entity of [...rankings.idp, ...rankings.kickers, ...rankings.defenses]) {
            defenseValues[entity.id] = entity.valueScore;
        }
    }

    return {
        leagueName:          league.leagueName,
        scoringType:         league.scoringType ?? null,
        totalRosters:        league.totalRosters,
        draftRounds,
        draftOrderProjected,
        leagueType,
        rosterPositions,
        scoringSettings:     rawScoringSettings,
        sleeperLeagueId:     league.leagueId,
        mySleeperUserId:     mySleeperUserId ?? null,
        defenseValues,
        myTeamData,
        otherTeamsData,
    };
}
