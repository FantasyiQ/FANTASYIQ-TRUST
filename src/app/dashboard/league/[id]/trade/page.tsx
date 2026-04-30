export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getLeague, getLeagueUsers, getLeagueRosters, getPlayers,
    getTradedPicks, getLeagueDrafts, buildPickOwnerMap, buildRosterSlotMap,
} from '@/lib/sleeper';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import { stripe, priceIdToTier } from '@/lib/stripe';
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { LeagueSettings, LeagueType, SubscriptionTier } from '@/lib/trade-engine';
import LeagueTradeEvaluator from '../LeagueTradeEvaluator';

const BENCH_SLOTS = new Set(['BN', 'IR']);

function buildLeagueSettings(
    rosterPositions: string[],
    scoringSettings: Record<string, number> | null | undefined,
): LeagueSettings {
    const ss = scoringSettings ?? {};
    let qbSlots = 0, rbSlots = 0, wrSlots = 0, teSlots = 0, flexSlots = 0, sfSlots = 0;
    for (const pos of rosterPositions) {
        switch (pos) {
            case 'QB':         qbSlots++;   break;
            case 'RB':         rbSlots++;   break;
            case 'WR':         wrSlots++;   break;
            case 'TE':         teSlots++;   break;
            case 'FLEX':       flexSlots++; break;
            case 'SUPER_FLEX': sfSlots++;   break;
            case 'REC_FLEX':   flexSlots++; break;
        }
    }
    return {
        passTd:     ss.pass_td      ?? DEFAULT_LEAGUE_SETTINGS.passTd,
        bonusRecTe: ss.bonus_rec_te ?? DEFAULT_LEAGUE_SETTINGS.bonusRecTe,
        qbSlots:    qbSlots  || DEFAULT_LEAGUE_SETTINGS.qbSlots,
        rbSlots:    rbSlots  || DEFAULT_LEAGUE_SETTINGS.rbSlots,
        wrSlots:    wrSlots  || DEFAULT_LEAGUE_SETTINGS.wrSlots,
        teSlots:    teSlots  || DEFAULT_LEAGUE_SETTINGS.teSlots,
        flexSlots,
        sfSlots,
    };
}

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id: true, userId: true, leagueId: true, leagueName: true,
            scoringType: true, totalRosters: true, rosterPositions: true,
            sleeperUserId: true,
        },
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

    // ── Tier check ────────────────────────────────────────────────────────────
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
        where: {
            type:       'commissioner',
            leagueName: { equals: league.leagueName, mode: 'insensitive' },
            status:     { in: ['active', 'trialing'] },
        },
        orderBy: { createdAt: 'desc' },
        select:  { tier: true },
    });

    const syncedNameToId   = new Map((dbUser?.leagues ?? []).map(l => [l.leagueName.toLowerCase().trim(), l.id]));
    const leagueConnected  = (dbUser?.connectedLeagues ?? []).some(cl => {
        if (cl.leagueName.toLowerCase().trim() === league.leagueName.toLowerCase().trim()) return true;
        return syncedNameToId.get(cl.leagueName.toLowerCase().trim()) === league.id;
    });
    const effectiveTier       = effectiveTierForLeague(playerTier, commSub?.tier ?? null, leagueConnected);
    const canUseTradeEvaluator = tierLevel(effectiveTier) >= 2;

    if (!canUseTradeEvaluator) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
                <p className="text-[#C8A951] font-semibold text-lg">Unlock Trade Evaluator</p>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                    Trade Evaluator requires an All-Pro plan or higher.
                </p>
                <Link
                    href="/pricing"
                    className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-6 py-2.5 rounded-lg transition text-sm mt-2"
                >
                    View Plans
                </Link>
            </div>
        );
    }

    // ── Build trade data ──────────────────────────────────────────────────────
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    const rosterPositions = (league.rosterPositions as string[]) ?? sleeperLeague.roster_positions ?? [];
    const leagueType: LeagueType = sleeperLeague.settings?.type === 2 ? 'Dynasty' : 'Redraft';
    const leagueSettings = buildLeagueSettings(rosterPositions, sleeperLeague.scoring_settings);
    const draftRounds    = sleeperLeague.settings?.draft_rounds ?? 5;

    const _now       = new Date();
    const _pastDraft = _now.getMonth() + 1 > 4 || (_now.getMonth() + 1 === 4 && _now.getDate() >= 25);
    const _base      = _pastDraft ? _now.getFullYear() + 1 : _now.getFullYear();
    const FUTURE_SEASONS = [String(_base), String(_base + 1), String(_base + 2)];
    const ROUNDS         = Array.from({ length: draftRounds }, (_, i) => i + 1);
    const rosterIds      = rosters.map(r => r.roster_id);

    const rows = rosters
        .map(roster => {
            const fpts     = (roster.settings?.fpts ?? 0) + (roster.settings?.fpts_decimal ?? 0) / 100;
            const teamName = `Team ${roster.roster_id}`;
            return { roster, teamName, wins: roster.settings?.wins ?? 0, fpts };
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
            .map(pid => ({
                name:     allPlayers[pid].full_name,
                position: allPlayers[pid].position,
                team:     allPlayers[pid].team,
            })),
        ownedPicks: computeOwnedPicks(row.roster.roster_id),
    }));

    const myTeamData     = mySleeperUserId
        ? teamTradeData.find(t => rosters.find(r => r.roster_id === t.rosterId)?.owner_id === mySleeperUserId)
        : undefined;
    const otherTeamsData = teamTradeData.filter(t => t.rosterId !== myTeamData?.rosterId);

    return (
        <LeagueTradeEvaluator
            leagueName={league.leagueName}
            scoringType={league.scoringType ?? null}
            totalRosters={league.totalRosters}
            draftRounds={draftRounds}
            draftOrderProjected={draftOrderProjected}
            leagueType={leagueType}
            rosterPositions={rosterPositions}
            scoringSettings={sleeperLeague.scoring_settings}
            myTeamData={myTeamData}
            otherTeamsData={otherTeamsData}
        />
    );
}
