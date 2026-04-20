'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { unsyncLeague } from '@/app/actions/leagues';
import { tierBadgeProps } from '@/lib/tier-badge';

interface League {
    id: string;
    leagueId: string;
    leagueName: string;
    season: string;
    status: string;
    totalRosters: number;
    scoringType: string | null;
    avatar: string | null;
    standings: unknown;
    lastSyncedAt: Date | null;
}

interface CommSub {
    leagueName: string | null;
    tier: string;
}

interface Props {
    leagues: League[];
    playerTier: string;
    commSubs: CommSub[];
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

export default function SleeperLeaguesList({ leagues: initialLeagues, playerTier, commSubs }: Props) {
    const [leagues] = useState<League[]>(initialLeagues);

    if (leagues.length === 0) {
        return (
            <div className="px-6 py-14 text-center">
                <p className="text-gray-400 mb-1">No leagues synced yet.</p>
                <p className="text-gray-600 text-sm mb-4">Connect your Sleeper account to get started.</p>
                <Link href="/dashboard/sync"
                    className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm">
                    Sync a Sleeper League
                </Link>
            </div>
        );
    }

    return (
        <ul className="divide-y divide-gray-800/50">
            {leagues.map((league) => {
                const standing = (league.standings as { wins: number; losses: number }[] | null)?.[0];
                // Player tier applies to all leagues; commissioner tier scoped to matching league name
                const leagueTier = playerTier !== 'FREE'
                    ? playerTier
                    : (commSubs.find(s => s.leagueName?.toLowerCase().trim() === league.leagueName.toLowerCase().trim())?.tier ?? 'FREE');
                const badge = tierBadgeProps(leagueTier);
                return (
                    <li key={league.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-800/30 transition-colors">
                        <Link
                            href={`/dashboard/league/${league.id}`}
                            className="flex items-center gap-4 flex-1 min-w-0 text-left"
                        >
                            {league.avatar ? (
                                <Image
                                    src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                    alt={league.leagueName} width={40} height={40}
                                    className="rounded-lg shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center text-gray-600 text-xs font-bold">FF</div>
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
                                {/* Tier badge (plan level) — secondary info, right side */}
                                {badge && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.className}`}>
                                        {badge.label}
                                    </span>
                                )}
                                <span className="text-[#C8A951] text-sm font-semibold whitespace-nowrap">View →</span>
                            </div>
                        </Link>
                        <form action={unsyncLeague.bind(null, league.leagueId)}>
                            <button type="submit" title="Unsync"
                                className="text-gray-600 hover:text-red-400 transition text-sm px-2 py-1 rounded">
                                ✕
                            </button>
                        </form>
                    </li>
                );
            })}
        </ul>
    );
}
