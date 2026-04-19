'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { unsyncLeague } from '@/app/actions/leagues';
import { tierBadgeProps } from '@/lib/tier-badge';

function RefreshIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
    );
}

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
    const [leagues, setLeagues] = useState<League[]>(initialLeagues);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<{ id: string; message: string } | null>(null);

    async function handleSync(leagueId: string) {
        if (syncingId) return;
        setSyncingId(leagueId);
        setSyncError(null);
        try {
            const res = await fetch(`/api/sleeper/leagues/${leagueId}/refresh`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json() as { error?: string };
                const message = data.error ?? 'Sync failed';
                setSyncError({ id: leagueId, message });
                setTimeout(() => setSyncError(null), 3000);
                return;
            }
            const updated = await res.json() as League;
            setLeagues(prev => prev.map(l => l.id === leagueId ? { ...l, ...updated } : l));
        } catch {
            setSyncError({ id: leagueId, message: 'Network error' });
            setTimeout(() => setSyncError(null), 3000);
        } finally {
            setSyncingId(null);
        }
    }

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
                                    {badge && (
                                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.className}`}>
                                            {badge.label}
                                        </span>
                                    )}
                                </div>
                                <p className="text-gray-500 text-xs mt-0.5">
                                    {league.season} · {league.totalRosters} teams
                                    {league.scoringType ? ` · ${league.scoringType.replace('_', ' ').toUpperCase()}` : ''}
                                    {standing ? ` · ${standing.wins}-${standing.losses}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClass(league.status)}`}>
                                        {statusLabel(league.status)}
                                    </span>
                                    <p className="text-gray-700 text-xs mt-1 tabular-nums">
                                        {formatSyncTime(league.lastSyncedAt)}
                                    </p>
                                </div>
                                <span className="text-[#C8A951] text-sm font-semibold whitespace-nowrap">View →</span>
                            </div>
                        </Link>
                        <div className="flex flex-col items-center gap-1">
                            <button
                                onClick={() => handleSync(league.id)}
                                disabled={syncingId !== null}
                                title="Sync league data from Sleeper"
                                className="p-1.5 rounded-full text-gray-600 hover:text-[#C8A951] hover:bg-[#C8A951]/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <RefreshIcon className={`w-3.5 h-3.5 ${syncingId === league.id ? 'animate-spin' : ''}`} />
                            </button>
                            {syncError?.id === league.id && (
                                <span className="text-red-400 text-xs max-w-[60px] text-center leading-tight">{syncError.message}</span>
                            )}
                        </div>
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
