'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

interface ConnectedLeague {
    id: string;
    leagueName: string;
    platform: string | null;
}

interface Props {
    leagues: ConnectedLeague[];
    limit: number;  // Infinity for elite
    nextTier: string | null;  // e.g. "All-Pro", or null if already elite/no sub
    tierLabel: string;  // e.g. "Player Pro"
}

const PLATFORMS = ['ESPN', 'Yahoo', 'Sleeper', 'NFL', 'CBS', 'Other'];

export default function ConnectedLeagues({ leagues: initial, limit, nextTier, tierLabel }: Props) {
    const [leagues, setLeagues] = useState<ConnectedLeague[]>(initial);
    const [showForm, setShowForm] = useState(false);
    const [leagueName, setLeagueName] = useState('');
    const [platform, setPlatform] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const count = leagues.length;
    const atLimit = limit !== Infinity && count >= limit;

    function countLabel() {
        if (limit === Infinity) return `${count} League${count !== 1 ? 's' : ''} Connected`;
        return `${count} / ${limit} Leagues Connected`;
    }

    async function handleAdd() {
        if (!leagueName.trim()) return;
        setError(null);
        startTransition(async () => {
            try {
                const res = await fetch('/api/leagues', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leagueName: leagueName.trim(), platform: platform || undefined }),
                });
                const data = await res.json() as ConnectedLeague & { error?: string };
                if (!res.ok) {
                    setError(data.error ?? 'Failed to add league.');
                    return;
                }
                setLeagues(prev => [...prev, data]);
                setLeagueName('');
                setPlatform('');
                setShowForm(false);
            } catch {
                setError('Network error. Please try again.');
            }
        });
    }

    async function handleRemove(id: string) {
        setError(null);
        startTransition(async () => {
            try {
                const res = await fetch(`/api/leagues?leagueId=${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const data = await res.json() as { error?: string };
                    setError(data.error ?? 'Failed to remove league.');
                    return;
                }
                setLeagues(prev => prev.filter(l => l.id !== id));
            } catch {
                setError('Network error. Please try again.');
            }
        });
    }

    return (
        <div className="mt-5 pt-5 border-t border-gray-800">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div>
                    <p className="text-sm font-semibold text-white">{countLabel()}</p>
                    {!atLimit && (
                        <p className="text-gray-600 text-xs mt-0.5">
                            {limit === Infinity ? 'Unlimited leagues on Elite' : `${limit - count} slot${limit - count !== 1 ? 's' : ''} remaining`}
                        </p>
                    )}
                </div>
                {atLimit ? (
                    <div className="text-right">
                        <p className="text-yellow-500/80 text-xs mb-1">You&apos;ve maxed your leagues</p>
                        {nextTier && (
                            <Link href="/pricing"
                                className="text-xs font-semibold text-[#C8A951] hover:underline">
                                Upgrade to {tierLabel.replace('Pro', nextTier).replace('All-Pro', nextTier)} →
                            </Link>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => { setShowForm(v => !v); setError(null); }}
                        className="text-sm border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-3 py-1.5 rounded-lg transition">
                        {showForm ? 'Cancel' : '+ Connect League'}
                    </button>
                )}
            </div>

            {/* Inline add form */}
            {showForm && (
                <div className="mb-3 flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="League name"
                            value={leagueName}
                            onChange={e => setLeagueName(e.target.value)}
                            maxLength={80}
                            onKeyDown={e => { if (e.key === 'Enter') void handleAdd(); }}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                        />
                    </div>
                    <select
                        value={platform}
                        onChange={e => setPlatform(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-[#C8A951]/60">
                        <option value="">Platform (optional)</option>
                        {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button
                        onClick={() => { void handleAdd(); }}
                        disabled={isPending || !leagueName.trim()}
                        className="bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                        {isPending ? 'Adding…' : 'Add'}
                    </button>
                </div>
            )}

            {error && (
                <p className="text-red-400 text-xs mb-3">{error}</p>
            )}

            {/* League list */}
            {leagues.length > 0 && (
                <ul className="space-y-1.5">
                    {leagues.map(l => (
                        <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-800/50 rounded-lg">
                            <div className="min-w-0">
                                <span className="text-sm text-white font-medium truncate block">{l.leagueName}</span>
                                {l.platform && (
                                    <span className="text-gray-500 text-xs">{l.platform}</span>
                                )}
                            </div>
                            <button
                                onClick={() => { void handleRemove(l.id); }}
                                disabled={isPending}
                                className="shrink-0 text-gray-600 hover:text-red-400 transition text-sm px-1.5 py-0.5 rounded disabled:opacity-50"
                                title="Remove">
                                ✕
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
