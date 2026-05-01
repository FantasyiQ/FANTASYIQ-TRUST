export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getSafeSleeperLeague, getLeagueRosters, getPlayers, getTradedPicks,
    getDraftPickCount, buildPickOwnerMap, buildRosterSlotMap,
    summariseRosterPositions,
    type SleeperLeagueMember, type SleeperRoster,
} from '@/lib/sleeper';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import { stripe, priceIdToTier } from '@/lib/stripe';
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { LeagueSettings, LeagueType } from '@/lib/trade-engine';
import type { SubscriptionTier } from '@prisma/client';
import type { TeamRosterData } from '../RosterCards';
import LeagueTradeEvaluator from '../LeagueTradeEvaluator';
import { type StandingRow, type AnnouncementData, type SleeperSettings } from '../LeagueDetailTabs';
import type { DuesManagerData } from '../DuesManager';
import LeagueOverviewCards from '../LeagueOverviewCards';
import { getPickSeasons } from '@/lib/fantasy/getPickSeasons';

const BENCH_SLOTS = new Set(['BN', 'IR']);

function fpts(r: SleeperRoster) {
    return (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
}

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

export default async function LeagueOverviewPage({
    params,
    searchParams,
}: {
    params:       Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { id } = await params;
    const sp = await searchParams;
    const showPlanModal             = sp.showPlanModal === '1';
    const showCommissionerPlanModal = sp.showCommissionerPlanModal === '1';
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
    const [allPlayers, tradedPicks, dbUser, leagueDuesRecord, proBowlContest] = await Promise.all([
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
                members: {
                    select:  { id: true, userId: true, displayName: true, teamName: true, duesStatus: true, paymentMethod: true },
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
    ]);
    const sleeperLeague = await safeLeagueP;
    const rosters       = sleeperLeague.rosters;
    const members       = sleeperLeague.users;
    const drafts        = sleeperLeague.drafts;
    const isDrafting    = sleeperLeague.isDrafting;

    // ── Commissioner tier lookup ───────────────────────────────────────────────
    let commSubForLeague: { tier: string } | null = null;
    {
        const sleeperCommId = members.find(m => m.is_owner)?.user_id ?? null;
        let commDbUserId: string | null = null;
        if (sleeperCommId) {
            const commUser = await prisma.user.findFirst({
                where:  { sleeperUserId: sleeperCommId },
                select: { id: true },
            });
            commDbUserId = commUser?.id ?? null;
        }
        if (!commDbUserId) commDbUserId = leagueDuesRecord?.commissionerId ?? null;
        if (commDbUserId) {
            commSubForLeague = await prisma.subscription.findFirst({
                where: {
                    userId:      commDbUserId,
                    type:        'commissioner',
                    leagueName:  { equals: league.leagueName, mode: 'insensitive' },
                    status:      { in: ['active', 'trialing'] },
                },
                orderBy: { createdAt: 'desc' },
                select:  { tier: true },
            });
        }
    }

    // ── Player tier (Stripe-verified) ─────────────────────────────────────────
    const activePlayerSub = dbUser?.subscriptions.find(s => s.type === 'player') ?? null;
    let playerTier = activePlayerSub?.tier ?? 'FREE';
    if (activePlayerSub?.stripeSubscriptionId) {
        try {
            const stripeSub     = await stripe.subscriptions.retrieve(activePlayerSub.stripeSubscriptionId);
            const currentPriceId = stripeSub.items.data[0]?.price.id;
            const stripeTier     = currentPriceId ? priceIdToTier(currentPriceId) : null;
            if (stripeTier) {
                playerTier = stripeTier;
                if (stripeTier !== activePlayerSub.tier) {
                    prisma.subscription.update({
                        where: { id: activePlayerSub.id },
                        data:  { tier: stripeTier as SubscriptionTier },
                    }).catch(() => {});
                }
            }
        } catch { /* Stripe unreachable — fall back to DB */ }
    }

    const syncedNameToId  = new Map((dbUser?.leagues ?? []).map(l => [l.leagueName.toLowerCase().trim(), l.id]));
    const leagueConnected = (dbUser?.connectedLeagues ?? []).some(cl => {
        if (cl.leagueName.toLowerCase().trim() === league.leagueName.toLowerCase().trim()) return true;
        return syncedNameToId.get(cl.leagueName.toLowerCase().trim()) === league.id;
    });
    const effectiveTier       = effectiveTierForLeague(playerTier, commSubForLeague?.tier ?? null, leagueConnected);
    const canUseTradeEvaluator = tierLevel(effectiveTier) >= 2;

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

    const leagueSeason = Number(sleeperLeague.season);
    const currentDraft = drafts.find(d => d.season === sleeperLeague.season) ?? null;
    const hasDraft     = currentDraft !== null;
    // A draft is only "complete" if Sleeper reports it complete AND it has real picks.
    // Placeholder future drafts (auto-created by Sleeper) can have status "complete" with 0 picks.
    // Never treat a draft as complete while it is actively in progress (blackout protection).
    const draftCompleted = !isDrafting
        && !!currentDraft
        && leagueSeason <= new Date().getFullYear()
        && currentDraft.status === 'complete'
        && (await getDraftPickCount(currentDraft.draft_id)) > 0;
    const FUTURE_SEASONS = getPickSeasons({ leagueSeason, hasDraft, draftCompleted, isDrafting });
    const draftRounds    = sleeperLeague.settings.draft_rounds;
    const ROUNDS         = Array.from({ length: draftRounds }, (_, i) => i + 1);
    const rosterIds      = rosters.map(r => r.roster_id);

    const standingsRank = new Map(rows.map(row => [row.roster.roster_id, row.rank]));
    const draft         = drafts[0] ?? null;
    const { slotMap: rosterIdToSlot, projected: draftOrderProjected } =
        buildRosterSlotMap(rosters, draft, standingsRank, league.totalRosters);
    void rosterIdToSlot;

    const currentAllZero   = rosters.every(r => (r.settings?.wins ?? 0) === 0 && (r.settings?.losses ?? 0) === 0);
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

    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;

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
    const leagueType: LeagueType = sleeperLeague.settings?.type === 2 ? 'Dynasty' : 'Redraft';
    const leagueSettings = buildLeagueSettings(rosterPositions, sleeperLeague.scoring_settings);

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
        })),
    } : null;

    const announcements: AnnouncementData[] = (leagueDuesRecord?.announcements ?? []).map(a => ({
        id:         a.id,
        body:       a.body,
        mediaUrl:   a.mediaUrl ?? null,
        pinned:     a.pinned,
        createdAt:  a.createdAt.toISOString(),
        authorName: a.author.name ?? null,
    }));

    const sleeperSettings: SleeperSettings = {
        playoff_teams:  sleeperLeague.settings?.playoff_teams,
        type:           sleeperLeague.settings?.type,
        trade_deadline: sleeperLeague.settings?.trade_deadline,
    };

    const commissionerSleeperUserId = members.find(m => m.is_owner)?.user_id;
    const isCommissioner = !!commissionerSleeperUserId && !!mySleeperUserId &&
        String(commissionerSleeperUserId).trim() === String(mySleeperUserId).trim();

    const tradeEvaluatorContent = canUseTradeEvaluator ? (
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
    ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <p className="text-gray-400 text-sm mb-1">Trade Evaluator requires All-Pro or higher.</p>
            <p className="text-gray-600 text-xs mb-4">
                Upgrade your player plan, or the commissioner can upgrade their league plan —{' '}
                and connect this league to your player plan to unlock it.
            </p>
            <a href="/pricing" className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm">
                View Plans
            </a>
        </div>
    );

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
                <a href={`/pricing?tab=commissioner`} className="shrink-0 bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-4 py-2 rounded-lg transition text-xs whitespace-nowrap">
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
            leagueType={leagueType}
            leagueSettings={leagueSettings}
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
            tradeEvaluatorContent={tradeEvaluatorContent}
            isCommissioner={isCommissioner}
            currentUserId={session.user.id}
            canUsePlayerRankings={canUseTradeEvaluator}
        />
        </>
    );
}
