export const maxDuration = 60;

import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    getLeague, getLeagueUsers, getLeagueRosters, getPlayers, getTradedPicks,
    getLeagueDrafts, buildPickOwnerMap, buildRosterSlotMap,
    scoringLabel, summariseRosterPositions,
    type SleeperLeagueMember, type SleeperRoster,
} from '@/lib/sleeper';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import { stripe, priceIdToTier } from '@/lib/stripe';
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import { tierBadgeProps } from '@/lib/tier-badge';
import type { LeagueSettings, LeagueType } from '@/lib/trade-engine';
import type { SubscriptionTier } from '@prisma/client';
import type { TeamRosterData } from './RosterCards';
import LeagueTradeEvaluator from './LeagueTradeEvaluator';
import LeagueDetailTabs, { type StandingRow, type DuesData, type AnnouncementData, type SleeperSettings } from './LeagueDetailTabs';

const BENCH_SLOTS = new Set(['BN', 'IR']);

function fpts(r: SleeperRoster) {
    return (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
}

function statusBadge(status: string) {
    switch (status) {
        case 'in_season':  return 'bg-green-900/40 text-green-400 border-green-800';
        case 'drafting':   return 'bg-blue-900/40 text-blue-400 border-blue-800';
        case 'pre_draft':  return 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
        default:           return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

function statusLabel(status: string) {
    switch (status) {
        case 'in_season':  return 'In Season';
        case 'drafting':   return 'Drafting';
        case 'pre_draft':  return 'Pre-Draft';
        case 'complete':   return 'Complete';
        default:           return status;
    }
}


function buildLeagueSettings(rosterPositions: string[], scoringSettings: Record<string, number> | null | undefined): LeagueSettings {
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

export default async function LeagueDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where: { id },
        select: {
            id: true, userId: true, leagueId: true, leagueName: true,
            season: true, status: true, totalRosters: true, scoringType: true,
            avatar: true, rosterPositions: true, sleeperUserId: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    const [sleeperLeague, members, rosters, allPlayers, tradedPicks, drafts, dbUser, commSubForLeague, leagueDuesRecord] = await Promise.all([
        getLeague(league.leagueId),
        getLeagueUsers(league.leagueId),
        getLeagueRosters(league.leagueId),
        getPlayers(),
        getTradedPicks(league.leagueId),
        getLeagueDrafts(league.leagueId),
        prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                sleeperUserId: true,
                connectedLeagues: { select: { leagueName: true } },
                subscriptions: {
                    where: { status: { in: ['active', 'trialing'] } },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, type: true, tier: true, leagueName: true, stripeSubscriptionId: true },
                },
                leagues: { select: { id: true, leagueName: true } },
            },
        }),
        prisma.subscription.findFirst({
            where: {
                userId: session.user.id,
                type: 'commissioner',
                leagueName: { equals: league.leagueName, mode: 'insensitive' },
                status: { in: ['active', 'trialing'] },
            },
            select: { tier: true },
        }),
        // Dues + payouts + announcements for THIS league only
        prisma.leagueDues.findFirst({
            where: {
                leagueName: { equals: league.leagueName, mode: 'insensitive' },
                season: league.season,
            },
            select: {
                id: true,
                buyInAmount: true,
                potTotal: true,
                status: true,
                teamCount: true,
                payoutSpots: {
                    select: { label: true, amount: true, sortOrder: true },
                    orderBy: { sortOrder: 'asc' },
                },
                members: {
                    select: { id: true, displayName: true, teamName: true, duesStatus: true },
                    orderBy: { displayName: 'asc' },
                },
                announcements: {
                    select: {
                        id: true, body: true, mediaUrl: true, pinned: true, createdAt: true,
                        author: { select: { name: true } },
                    },
                    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
                    take: 3,
                },
            },
        }),
    ]);

    // ── Sleeper user identity ─────────────────────────────────────────────────
    // User.sleeperUserId is set during sync. League.sleeperUserId is a fallback for users
    // who synced before User.sleeperUserId was persisted. Heal User record if needed.
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    if (!dbUser?.sleeperUserId && league.sleeperUserId) {
        prisma.user.update({
            where: { id: session.user.id },
            data: { sleeperUserId: league.sleeperUserId },
        }).catch(() => {});
    }

    // ── Access control ────────────────────────────────────────────────────────
    const activePlayerSub = dbUser?.subscriptions.find(s => s.type === 'player') ?? null;

    // Verify player tier against Stripe so feature gating is accurate after billing-portal upgrades.
    let playerTier: string = activePlayerSub?.tier ?? 'FREE';
    if (activePlayerSub?.stripeSubscriptionId) {
        try {
            const stripeSub = await stripe.subscriptions.retrieve(activePlayerSub.stripeSubscriptionId);
            const currentPriceId = stripeSub.items.data[0]?.price.id;
            const stripeTier = currentPriceId ? priceIdToTier(currentPriceId) : null;
            if (stripeTier) {
                playerTier = stripeTier;
                if (stripeTier !== activePlayerSub.tier) {
                    prisma.subscription.update({
                        where: { id: activePlayerSub.id },
                        data: { tier: stripeTier as SubscriptionTier },
                    }).catch(() => {});
                }
            }
        } catch { /* Stripe unreachable — fall back to DB */ }
    }

    const syncedNameToId = new Map(
        (dbUser?.leagues ?? []).map(l => [l.leagueName.toLowerCase().trim(), l.id])
    );
    const leagueConnected = (dbUser?.connectedLeagues ?? []).some(cl => {
        if (cl.leagueName.toLowerCase().trim() === league.leagueName.toLowerCase().trim()) return true;
        return syncedNameToId.get(cl.leagueName.toLowerCase().trim()) === league.id;
    });
    const effectiveTier  = effectiveTierForLeague(playerTier, commSubForLeague?.tier ?? null, leagueConnected);
    const effectiveLevel = tierLevel(effectiveTier);
    const canUseTradeEvaluator = effectiveLevel >= 2;

    // ── Derived data ──────────────────────────────────────────────────────────
    const memberMap = new Map<string, SleeperLeagueMember>(members.map(m => [m.user_id, m]));

    const rows = rosters
        .map((roster) => {
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
        for (const pid of r.players ?? []) neededIds.add(pid);
        for (const pid of r.starters ?? []) neededIds.add(pid);
    }
    neededIds.delete('0');

    const players: Record<string, typeof allPlayers[string]> = {};
    for (const pid of neededIds) { if (allPlayers[pid]) players[pid] = allPlayers[pid]; }

    const _now       = new Date();
    const _pastDraft = _now.getMonth() + 1 > 4 || (_now.getMonth() + 1 === 4 && _now.getDate() >= 25);
    const _base      = _pastDraft ? _now.getFullYear() + 1 : _now.getFullYear();
    const FUTURE_SEASONS = [String(_base), String(_base + 1), String(_base + 2)];
    const draftRounds    = sleeperLeague.settings?.draft_rounds ?? 5;
    const ROUNDS         = Array.from({ length: draftRounds }, (_, i) => i + 1);
    const rosterIds      = rosters.map(r => r.roster_id);

    const standingsRank = new Map(rows.map(row => [row.roster.roster_id, row.rank]));
    const draft         = drafts[0] ?? null;
    const { slotMap: rosterIdToSlot, projected: draftOrderProjected } =
        buildRosterSlotMap(rosters, draft, standingsRank, league.totalRosters);

    const currentAllZero = rosters.every(
        r => (r.settings?.wins ?? 0) === 0 && (r.settings?.losses ?? 0) === 0
    );
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
                    const origTeamName = traded
                        ? rows.find(r => r.roster.roster_id === origId)?.teamName
                        : undefined;
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

    const hasTies = rows.some(r => r.ties > 0);
    const hasPA   = rows.some(r => r.fpts > 0);

    // ── Serialise for client component ────────────────────────────────────────
    const leagueType: LeagueType = sleeperLeague.settings?.type === 2 ? 'Dynasty' : 'Redraft';
    const leagueSettings = buildLeagueSettings(rosterPositions, sleeperLeague.scoring_settings);

    const standingRows: StandingRow[] = rows.map(row => ({
        rosterId:  row.roster.roster_id,
        rank:      row.rank,
        teamName:  row.teamName,
        username:  row.member?.username,
        avatar:    row.member?.avatar ?? null,
        wins:      row.wins,
        losses:    row.losses,
        ties:      row.ties,
        fpts:      row.fpts,
    }));

    const duesData: DuesData | null = leagueDuesRecord ? {
        id:          leagueDuesRecord.id,
        buyInAmount: leagueDuesRecord.buyInAmount,
        potTotal:    leagueDuesRecord.potTotal,
        status:      leagueDuesRecord.status,
        teamCount:   leagueDuesRecord.teamCount,
        payoutSpots: leagueDuesRecord.payoutSpots,
        members:     leagueDuesRecord.members.map(m => ({
            id:          m.id,
            displayName: m.displayName,
            teamName:    m.teamName ?? null,
            duesStatus:  m.duesStatus,
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

    // Commissioner check: Sleeper marks the commissioner via is_owner on the member list.
    const commissionerSleeperUserId = members.find(m => m.is_owner)?.user_id;
    const isCommissioner = !!commissionerSleeperUserId && !!mySleeperUserId &&
        String(commissionerSleeperUserId).trim() === String(mySleeperUserId).trim();

    // Serialised member list for dues setup form (displayName + teamName from Sleeper rosters)
    const sleeperMembers = rows.map(row => ({
        displayName: row.member?.display_name ?? row.teamName,
        teamName: row.teamName,
    }));

    // Trade evaluator content — pre-composed server component passed as slot
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
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-6">

                <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                    ← My Leagues
                </Link>

                {/* League header */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-start gap-4">
                        {/* Avatar */}
                        {league.avatar ? (
                            <Image src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                alt={league.leagueName} width={64} height={64} className="rounded-xl shrink-0" />
                        ) : (
                            <div className="w-16 h-16 rounded-xl bg-gray-800 shrink-0 flex items-center justify-center text-2xl font-bold text-gray-600">FF</div>
                        )}

                        {/* Name + subtitle — left column */}
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-bold truncate">{league.leagueName}</h1>
                            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-gray-400">
                                <span>{league.season} Season</span>
                                <span className="text-gray-700">·</span>
                                <span>{scoringLabel(league.scoringType ?? 'std')}</span>
                                <span className="text-gray-700">·</span>
                                <span>{league.totalRosters} Teams</span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(league.status)}`}>
                                    {statusLabel(league.status)}
                                </span>
                            </div>
                        </div>

                        {/* Tier badge (top) + Manage Dues (bottom) — right column */}
                        <div className="flex flex-col items-end justify-between self-stretch shrink-0">
                            {(() => {
                                // Badge shows the user's OWN tier, not effectiveTier which can be
                                // inflated by the commissioner's plan (used for feature gating only).
                                // For commissioners without a player plan, show their commissioner tier.
                                const ownTier = playerTier !== 'FREE'
                                    ? playerTier
                                    : (isCommissioner ? (commSubForLeague?.tier ?? 'FREE') : 'FREE');
                                const tb = tierBadgeProps(ownTier);
                                if (!tb) return <span />;  // keep justify-between spacing
                                return (
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tb.className}`}>
                                        {tb.label}
                                    </span>
                                );
                            })()}
                            {isCommissioner && (
                                <Link
                                    href={leagueDuesRecord
                                        ? `/dashboard/commissioner/dues/${leagueDuesRecord.id}`
                                        : '/dashboard/commissioner'}
                                    className="text-sm text-[#C8A951]/70 hover:text-[#C8A951] font-medium transition whitespace-nowrap"
                                >
                                    Manage Dues →
                                </Link>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabbed content */}
                <LeagueDetailTabs
                    leagueId={id}
                    leagueName={league.leagueName}
                    season={league.season}
                    scoringType={league.scoringType ?? null}
                    totalRosters={league.totalRosters}
                    leagueType={leagueType}
                    leagueSettings={leagueSettings}
                    standingRows={standingRows}
                    hasTies={hasTies}
                    hasPA={hasPA}
                    teamRosters={teamRosters}
                    players={players}
                    rosterPositions={rosterPositions}
                    rosterPositionsSummary={summariseRosterPositions(rosterPositions)}
                    sleeperSettings={sleeperSettings}
                    duesData={duesData}
                    announcements={announcements}
                    tradeEvaluatorContent={tradeEvaluatorContent}
                    isCommissioner={isCommissioner}
                    canUsePlayerRankings={canUseTradeEvaluator}
                    sleeperLeagueId={league.leagueId}
                    sleeperMembers={sleeperMembers}
                />

            </div>
        </main>
    );
}
