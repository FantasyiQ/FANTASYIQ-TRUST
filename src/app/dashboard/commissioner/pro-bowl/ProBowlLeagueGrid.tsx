'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export interface LeagueCard {
    leagueName: string;
    platform:   string | null;
    // null = no dues tracker
    duesId:     string | null;
    // null = no contest yet
    contestId:  string | null;
    contestStatus: string | null;
    contestSeason: string | null;
    contestEntries: number;
}

function statusBadge(status: string) {
    switch (status) {
        case 'setup':    return 'bg-gray-800 text-gray-400 border-gray-700';
        case 'open':     return 'bg-green-900/40 text-green-400 border-green-800';
        case 'locked':   return 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
        case 'scoring':  return 'bg-blue-900/40 text-blue-400 border-blue-800';
        case 'complete': return 'bg-gray-800 text-gray-500 border-gray-700';
        default:         return 'bg-gray-800 text-gray-400 border-gray-700';
    }
}

function CreateCard({ card }: { card: LeagueCard }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleCreate() {
        setLoading(true);
        setError('');
        const season = new Date().getFullYear().toString();
        const res = await fetch('/api/pro-bowl/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                leagueName: card.leagueName,
                season,
                ...(card.duesId ? { leagueDuesId: card.duesId } : {}),
            }),
        });
        const data = await res.json() as { id?: string; error?: string };
        if (!res.ok || !data.id) { setError(data.error ?? 'Failed to create.'); setLoading(false); return; }
        router.push(`/dashboard/commissioner/pro-bowl/${data.id}`);
    }

    return (
        <button
            onClick={handleCreate}
            disabled={loading}
            className="group relative w-full text-left bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-2xl p-6 transition disabled:opacity-60">
            <div className="flex items-start justify-between gap-2 mb-3">
                <p className="font-bold text-white group-hover:text-[#C8A951] transition leading-snug">{card.leagueName}</p>
                {card.platform && <span className="text-xs text-gray-600 shrink-0 mt-0.5">{card.platform}</span>}
            </div>
            <p className="text-gray-500 text-sm">No contest yet</p>
            <div className="mt-4 text-[#C8A951] text-sm font-semibold opacity-0 group-hover:opacity-100 transition">
                {loading ? 'Creating…' : '+ Create Contest →'}
            </div>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </button>
    );
}

export default function ProBowlLeagueGrid({ leagues }: { leagues: LeagueCard[] }) {
    if (leagues.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                <div className="text-4xl mb-4">🏈</div>
                <h2 className="text-lg font-bold mb-2">No Synced Leagues Found</h2>
                <p className="text-gray-400 text-sm mb-6">Connect a league to get started.</p>
                <Link href="/dashboard"
                    className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-6 py-2.5 rounded-lg transition text-sm">
                    Go to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leagues.map(card => {
                // Has an existing contest → link to manage page
                if (card.contestId) {
                    return (
                        <Link key={card.leagueName}
                            href={`/dashboard/commissioner/pro-bowl/${card.contestId}`}
                            className="group block bg-gray-900 border border-gray-800 hover:border-[#C8A951]/50 rounded-2xl p-6 transition">
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <p className="font-bold text-white group-hover:text-[#C8A951] transition leading-snug">{card.leagueName}</p>
                                {card.platform && <span className="text-xs text-gray-600 shrink-0 mt-0.5">{card.platform}</span>}
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(card.contestStatus ?? '')}`}>
                                    {(card.contestStatus ?? '').charAt(0).toUpperCase() + (card.contestStatus ?? '').slice(1)}
                                </span>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">{card.contestSeason} · {card.contestEntries} entries</p>
                            <div className="mt-4 text-[#C8A951] text-sm font-semibold opacity-0 group-hover:opacity-100 transition">
                                Manage →
                            </div>
                        </Link>
                    );
                }

                // No contest yet → create inline (works with or without dues tracker)
                return <CreateCard key={card.leagueName} card={card} />;
            })}
        </div>
    );
}
