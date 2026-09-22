'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { unsyncLeague } from '@/app/actions/leagues';
import { tierBadgeProps } from '@/lib/tier-badge';
import { SortableLeagueList, DragHandle } from '@/components/SortableLeagueList';

interface League {
    id: string;
    leagueId: string;
    leagueName: string;
    platform: string;
    season: string;
    status: string;
    totalRosters: number;
    scoringType: string | null;
    avatar: string | null;
    standings: unknown;
    lastSyncedAt: Date | null;
    assignedPlanId:   string | null;
    assignedPlanType: string | null;
}

// A commissioner subscription this viewer's leagues are known to be
// covered by — may belong to a different user (whoever in the league
// actually pays). ownedByViewer gates whether the badge can link to a
// manage page the viewer actually has access to.
interface AssignedSub {
    id: string;
    tier: string;
    ownedByViewer: boolean;
}

interface Props {
    leagues: League[];
    playerTier: string;
    // False for an account whose PLAYER_* tier isn't backed by a real
    // Subscription row (e.g. a comped/test-mode grant) — /dashboard/plan/player
    // redirects to /pricing when there's no real subscription, so the badge
    // must not link there in that case.
    hasRealPlayerSub: boolean;
    assignedSubs: AssignedSub[];
    platform?: 'sleeper' | 'espn' | 'yahoo' | 'nfl';
    limitReachedIds?: Set<string>;
}

// Real per-league plan badge — sourced from the league's own assignedPlanId/
// assignedPlanType (the authoritative field, same one billing/auto-assign
// uses), not a fuzzy name match. Labeled with plan TYPE + level (e.g.
// "Commissioner ELITE ✦") since a league can be covered by either kind of
// plan and members need to know which. href is null when the covering
// subscription belongs to a different user — nothing to link to.
function planBadge(league: League, playerTier: string, hasRealPlayerSub: boolean, assignedSubs: AssignedSub[]): { label: string; className: string; href: string | null } | null {
    if (league.assignedPlanType === 'commissioner' && league.assignedPlanId) {
        const sub = assignedSubs.find(s => s.id === league.assignedPlanId);
        const tier = sub ? tierBadgeProps(sub.tier) : null;
        return tier ? { label: `Commissioner ${tier.label}`, className: tier.className, href: sub!.ownedByViewer ? `/dashboard/plan/commissioner/${league.assignedPlanId}` : null } : null;
    }
    // Explicit per-league assignment, OR an Elite account — Elite is
    // unlimited and covers every league automatically regardless of formal
    // assignment, same rule as effectiveTierForLeague() in league-limits.ts.
    if (league.assignedPlanType === 'player' || playerTier === 'PLAYER_ELITE') {
        const tier = tierBadgeProps(playerTier);
        return tier ? { label: `Player ${tier.label}`, className: tier.className, href: hasRealPlayerSub ? '/dashboard/plan/player' : null } : null;
    }
    return null;
}

function statusBadgeClass(status: string) {
    switch (status) {
        case 'in_season': return 'bg-green-900/40 text-green-400 border-green-800';
        case 'drafting':  return 'bg-blue-900/40 text-blue-400 border-blue-800';
        case 'pre_draft': return 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
        default:          return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

function statusLabel(status: string) {
    switch (status) {
        case 'in_season': return 'In Season';
        case 'pre_draft': return 'Pre-Draft';
        case 'drafting':  return 'Drafting';
        default:          return 'Complete';
    }
}

function formatSyncTime(date: Date | null): string {
    if (!date) return 'Never';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SleeperLeaguesList({ leagues: initialLeagues, playerTier, hasRealPlayerSub, assignedSubs, platform = 'sleeper', limitReachedIds = new Set() }: Props) {
    const [leagues, setLeagues] = useState<League[]>(initialLeagues);

    async function handleReorder(newOrder: League[]) {
        const prev = leagues;
        setLeagues(newOrder); // optimistic
        try {
            const res = await fetch('/api/leagues/reorder', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueIds: newOrder.map(l => l.id) }),
            });
            if (!res.ok) setLeagues(prev);
        } catch {
            setLeagues(prev);
        }
    }

    if (leagues.length === 0) {
        const syncHref  = platform === 'espn' ? '/dashboard/sync/espn' : platform === 'yahoo' ? '/dashboard/sync/yahoo' : platform === 'nfl' ? '/dashboard/sync/nfl' : '/dashboard/sync';
        const syncLabel = platform === 'espn' ? 'Sync an ESPN League' : platform === 'yahoo' ? 'Connect Yahoo' : platform === 'nfl' ? 'Connect NFL.com' : 'Sync a Sleeper League';
        const desc      = platform === 'espn' ? 'Connect your ESPN league to get started.' : platform === 'yahoo' ? 'Connect your Yahoo account to get started.' : platform === 'nfl' ? 'Connect your NFL.com account to get started.' : 'Connect your Sleeper account to get started.';
        return (
            <div className="px-6 py-14 text-center">
                <p className="text-gray-400 mb-1">No leagues synced yet.</p>
                <p className="text-gray-600 text-sm mb-4">{desc}</p>
                <Link href={syncHref}
                    className="inline-block bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm">
                    {syncLabel}
                </Link>
            </div>
        );
    }

    return (
        <ul className="divide-y divide-gray-800/50">
            <SortableLeagueList items={leagues} getId={l => l.id} onReorder={handleReorder}>
                {(league, drag) => {
                const standing = (league.standings as { wins: number; losses: number }[] | null)?.[0];
                const badge = planBadge(league, playerTier, hasRealPlayerSub, assignedSubs);
                return (
                    <div className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-800/30 transition-colors ${drag.isDragging ? 'bg-gray-800/50' : ''}`}>
                        <DragHandle attributes={drag.attributes} listeners={drag.listeners} />
                        <Link
                            href={`/dashboard/league/${league.id}`}
                            className="flex items-center gap-4 flex-1 min-w-0 text-left"
                        >
                            {league.avatar && league.platform !== 'espn' ? (
                                <Image
                                    src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                    alt={league.leagueName} width={40} height={40}
                                    className="rounded-lg shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center text-gray-600 text-xs font-bold">
                                    {league.platform === 'espn' ? 'ESPN' : 'FF'}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <p className="font-medium text-white truncate">{league.leagueName}</p>
                                    {/* Status badge (league state) sits next to the name — primary info */}
                                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClass(league.status)}`}>
                                        {statusLabel(league.status)}
                                    </span>
                                </div>
                                <p className="text-gray-500 text-xs mt-0.5">
                                    {league.season} · {league.totalRosters} teams
                                    {league.scoringType ? ` · ${league.scoringType.replace('_', ' ').toUpperCase()}` : ''}
                                    {standing ? ` · ${standing.wins}-${standing.losses}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                {/* Plan badge (type + level) — secondary info, right side. Links to
                                    that plan's management page. */}
                                {badge && (
                                    badge.href ? (
                                        <Link
                                            href={badge.href}
                                            onClick={e => e.stopPropagation()}
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border transition hover:opacity-80 ${badge.className}`}
                                        >
                                            {badge.label}
                                        </Link>
                                    ) : (
                                        <span
                                            title="No manage page available for this plan"
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.className}`}
                                        >
                                            {badge.label}
                                        </span>
                                    )
                                )}
                                {/* A league can carry a stale assignedPlanId/assignedPlanType
                                    pointing at a plan that no longer resolves (deleted or
                                    inactive subscription) — !badge catches that case too, not
                                    just the literally-unassigned one, so the row never shows
                                    neither a badge nor an add-a-plan prompt. */}
                                {!badge && (
                                    limitReachedIds.has(league.id) ? (
                                        <Link
                                            href={`/pricing?tab=commissioner&mode=new&size=${league.totalRosters}&leagueName=${encodeURIComponent(league.leagueName)}`}
                                            onClick={e => e.stopPropagation()}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-yellow-900/30 text-yellow-400 border-yellow-800 hover:bg-yellow-900/50 transition"
                                        >
                                            Upgrade to activate
                                        </Link>
                                    ) : (
                                        <Link
                                            href={`/pricing?tab=commissioner&mode=new&size=${league.totalRosters}&leagueName=${encodeURIComponent(league.leagueName)}`}
                                            onClick={e => e.stopPropagation()}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-gray-800 text-gray-400 border-gray-700 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] transition"
                                        >
                                            + Add a plan
                                        </Link>
                                    )
                                )}
                                <span className="text-[#D4AF37] text-sm font-semibold whitespace-nowrap">View →</span>
                            </div>
                        </Link>
                        <form action={unsyncLeague.bind(null, league.id, league.leagueId, league.platform)}>
                            <button
                                type="submit"
                                title="Remove league"
                                onClick={e => {
                                    if (!confirm(`Remove "${league.leagueName}" from your dashboard?\n\nYou can re-sync it at any time.`)) {
                                        e.preventDefault();
                                    }
                                }}
                                className="text-gray-600 hover:text-red-400 transition text-sm px-2 py-1 rounded"
                            >
                                ✕
                            </button>
                        </form>
                    </div>
                );
                }}
            </SortableLeagueList>
        </ul>
    );
}
