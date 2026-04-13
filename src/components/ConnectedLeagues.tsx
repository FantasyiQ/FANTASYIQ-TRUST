'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

interface ConnectedLeague {
    id: string;
    leagueName: string;
    platform: string | null;
    createdAt: string | Date;
}

interface SyncedLeague {
    id: string;
    leagueName: string;
    season: string;
    totalRosters: number;
}

interface Props {
    leagues: ConnectedLeague[];
    syncedLeagues?: SyncedLeague[];   // Sleeper-synced leagues to pick from
    limit: number;
    nextTier: string | null;
    tierLabel: string;
}

const PLATFORMS = ['ESPN', 'Yahoo', 'Sleeper', 'NFL', 'CBS', 'Other'];

function isLocked(createdAt: string | Date): boolean {
    const lockedUntil = new Date(createdAt);
    lockedUntil.setFullYear(lockedUntil.getFullYear() + 1);
    return new Date() < lockedUntil;
}

function lockLabel(createdAt: string | Date): string {
    const lockedUntil = new Date(createdAt);
    lockedUntil.setFullYear(lockedUntil.getFullYear() + 1);
    return lockedUntil.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ConnectedLeagues({ leagues: initial, syncedLeagues = [], limit, nextTier, tierLabel }: Props) {
    const [leagues, setLeagues] = useState<ConnectedLeague[]>(initial);
    const [showForm, setShowForm] = useState(false);
    const [showSyncedPicker, setShowSyncedPicker] = useState(false);
    const [leagueName, setLeagueName] = useState('');
    const [platform, setPlatform] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const count = leagues.length;
    const atLimit = limit !== Infinity && count >= limit;

    // Sleeper leagues not already connected (for the picker)
    const connectedNames = new Set(leagues.map(l => l.leagueName.toLowerCase()));
    const availableSynced = syncedLeagues.filter(
        sl => !connectedNames.has(sl.leagueName.toLowerCase())
    );

    // Map league name → synced league ID so connected entries can link to the detail page
    const syncedIdByName = new Map(
        syncedLeagues.map(sl => [sl.leagueName.toLowerCase(), sl.id])
    );

    function countLabel() {
        if (limit === Infinity) return `${count} League${count !== 1 ? 's' : ''} Connected`;
        return `${count} / ${limit} Leagues Connected`;
    }

    function selectSynced(sl: SyncedLeague) {
        setLeagueName(sl.leagueName);
        setPlatform('Sleeper');
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
                    setError((data as { error?: string }).error ?? 'Failed to add league.');
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

    async function handleAddSynced(sl: SyncedLeague) {
        setError(null);
        setShowSyncedPicker(false);
        startTransition(async () => {
            try {
                const res = await fetch('/api/leagues', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leagueName: sl.leagueName, platform: 'Sleeper' }),
                });
                const data = await res.json() as ConnectedLeague & { error?: string };
                if (!res.ok) {
                    setError((data as { error?: string }).error ?? 'Failed to add league.');
                    return;
                }
                setLeagues(prev => [...prev, data]);
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
        <>
        {showSyncedPicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowSyncedPicker(false)} />
                <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                    <h2 className="text-lg font-bold text-white mb-1">Add Synced League</h2>
                    <p className="text-gray-400 text-sm mb-4">Select a Sleeper league to connect to your player plan.</p>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {availableSynced.map((sl) => (
                            <button
                                key={sl.id}
                                onClick={() => { void handleAddSynced(sl); }}
                                disabled={isPending}
                                className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-[#C8A951]/50 rounded-xl transition group disabled:opacity-50">
                                <p className="text-white font-semibold text-sm group-hover:text-[#C8A951] transition">{sl.leagueName}</p>
                                <p className="text-gray-500 text-xs mt-0.5">{sl.totalRosters} teams · {sl.season}</p>
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setShowSyncedPicker(false)}
                        className="mt-4 w-full py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm font-semibold transition">
                        Cancel
                    </button>
                </div>
            </div>
        )}
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
                                Upgrade to Player {nextTier} →
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                        {availableSynced.length > 0 && (
                            <button
                                onClick={() => { setShowSyncedPicker(true); setError(null); }}
                                className="text-sm border border-[#C8A951]/40 hover:border-[#C8A951] text-[#C8A951] font-semibold px-3 py-1.5 rounded-lg transition">
                                + Synced League
                            </button>
                        )}
                        <button
                            onClick={() => { setShowForm(v => !v); setError(null); }}
                            className="text-sm border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-3 py-1.5 rounded-lg transition">
                            {showForm ? 'Cancel' : '+ Connect League'}
                        </button>
                    </div>
                )}
            </div>

            {/* Inline add form */}
            {showForm && (
                <div className="mb-4 bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
                    <p className="text-xs text-amber-400/80 font-medium">
                        ⚠ League slots are locked for 1 year once connected. Choose carefully.
                    </p>

                    {/* Pick from synced Sleeper leagues */}
                    {availableSynced.length > 0 && (
                        <div>
                            <p className="text-xs text-gray-500 mb-2">Select a synced league:</p>
                            <div className="flex flex-wrap gap-2">
                                {availableSynced.map(sl => (
                                    <button
                                        key={sl.id}
                                        type="button"
                                        onClick={() => selectSynced(sl)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                            leagueName === sl.leagueName && platform === 'Sleeper'
                                                ? 'border-[#C8A951] bg-[#C8A951]/10 text-[#C8A951]'
                                                : 'border-gray-700 text-gray-300 hover:border-[#C8A951]/50'
                                        }`}
                                    >
                                        {sl.leagueName}
                                        <span className="text-gray-500 ml-1">{sl.season} · {sl.totalRosters}T</span>
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 mt-3 mb-1">
                                <div className="h-px flex-1 bg-gray-700" />
                                <span className="text-gray-600 text-xs">or enter manually</span>
                                <div className="h-px flex-1 bg-gray-700" />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
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
                </div>
            )}

            {error && (
                <p className="text-red-400 text-xs mb-3">{error}</p>
            )}

            {/* League list */}
            {leagues.length > 0 && (
                <ul className="space-y-1.5">
                    {leagues.map(l => {
                        const locked = isLocked(l.createdAt);
                        const syncedId = syncedIdByName.get(l.leagueName.toLowerCase());
                        return (
                            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-800/50 rounded-lg">
                                <div className="min-w-0 flex-1">
                                    {syncedId ? (
                                        <Link
                                            href={`/dashboard/league/${syncedId}`}
                                            className="text-sm text-[#C8A951] font-medium truncate block hover:underline">
                                            {l.leagueName} →
                                        </Link>
                                    ) : (
                                        <span className="text-sm text-white font-medium truncate block">{l.leagueName}</span>
                                    )}
                                    <span className="text-gray-500 text-xs">
                                        {l.platform ? `${l.platform} · ` : ''}
                                        {locked
                                            ? `Locked until ${lockLabel(l.createdAt)}`
                                            : 'Removable'}
                                    </span>
                                </div>
                                {locked ? (
                                    <span
                                        title={`Locked until ${lockLabel(l.createdAt)}`}
                                        className="shrink-0 text-gray-600 text-sm px-1.5 py-0.5 rounded cursor-default select-none"
                                        aria-label="League slot locked">
                                        🔒
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => { void handleRemove(l.id); }}
                                        disabled={isPending}
                                        className="shrink-0 text-gray-600 hover:text-red-400 transition text-sm px-1.5 py-0.5 rounded disabled:opacity-50"
                                        title="Remove">
                                        ✕
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
        </>
    );
}
