'use client';

import { useState, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SleeperLeague, SleeperUser } from '@/lib/sleeper';
import LeagueAssignModal from './LeagueAssignModal';

type Step = 'username' | 'select' | 'done';

interface LookupResult {
    user: SleeperUser;
    leagues: SleeperLeague[];
    season: string;
}

interface SyncedLeague {
    id: string;
    leagueName: string;
    totalRosters: number;
    scoringType: string | null;
    assignedPlanId: string | null;
}

interface PlanOption {
    id: string;
    type: 'player' | 'commissioner';
    tier: string;
    leagueName: string | null;
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

function statusBadge(status: string) {
    switch (status) {
        case 'in_season':  return 'bg-green-900/40 text-green-400 border-green-800';
        case 'drafting':   return 'bg-blue-900/40 text-blue-400 border-blue-800';
        case 'pre_draft':  return 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
        default:           return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

function scoringLabel(league: SleeperLeague) {
    const rec = league.scoring_settings?.rec ?? 0;
    if (rec === 1) return 'PPR';
    if (rec === 0.5) return '0.5 PPR';
    return 'Std';
}

function SyncPageInner() {
    const router = useRouter();
    const searchParams   = useSearchParams();
    const inviteToken    = searchParams.get('invite');
    const inviteLeagueId = searchParams.get('leagueId');
    const inviteLeagueName = searchParams.get('leagueName');
    const fromInvite = !!(inviteToken && inviteLeagueId);

    const [step, setStep]       = useState<Step>('username');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const [result, setResult]   = useState<LookupResult | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [synced, setSynced]   = useState(0);

    // Assignment modal
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [syncedLeagues, setSyncedLeagues]     = useState<SyncedLeague[]>([]);
    const [availablePlans, setAvailablePlans]   = useState<PlanOption[]>([]);

    async function handleLookup(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/sleeper/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });
            const data = await res.json() as LookupResult & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to look up username'); return; }
            setResult(data);
            // When coming from an invite, pre-select only the invited league.
            // If that league isn't found under this username, select all (graceful fallback).
            if (fromInvite && inviteLeagueId) {
                const hasInvited = data.leagues.some(l => l.league_id === inviteLeagueId);
                setSelected(hasInvited
                    ? new Set([inviteLeagueId])
                    : new Set(data.leagues.map(l => l.league_id))
                );
            } else {
                setSelected(new Set(data.leagues.map((l) => l.league_id)));
            }
            setStep('select');
        } catch {
            setError('Network error — please try again');
        } finally {
            setLoading(false);
        }
    }

    function toggleLeague(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    async function handleSync() {
        if (!result || selected.size === 0) return;
        setError('');
        setLoading(true);
        const leaguesToSync = result.leagues.filter((l) => selected.has(l.league_id));
        try {
            const [syncRes, plansRes] = await Promise.all([
                fetch('/api/sleeper/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sleeperUserId: result.user.user_id, leagues: leaguesToSync }),
                }),
                fetch('/api/user/plans'),
            ]);
            const syncData  = await syncRes.json()  as { synced?: number; leagues?: SyncedLeague[]; error?: string };
            const plansData = await plansRes.json() as PlanOption[] | { error?: string };
            if (!syncRes.ok) { setError(syncData.error ?? 'Sync failed'); return; }

            setSynced(syncData.synced ?? selected.size);

            // If we came from an invite, loop back through the invite page.
            if (fromInvite && inviteToken) {
                router.replace(`/invite/${inviteToken}`);
                return;
            }

            // Show assignment modal if there are plans and unassigned leagues
            const leagues  = syncData.leagues ?? [];
            const plans    = Array.isArray(plansData) ? plansData : [];
            const hasUnassigned = leagues.some(l => !l.assignedPlanId);
            if (plans.length > 0 && hasUnassigned) {
                setSyncedLeagues(leagues);
                setAvailablePlans(plans);
                setShowAssignModal(true);
            }

            setStep('done');
        } catch {
            setError('Network error — please try again');
        } finally {
            setLoading(false);
        }
    }

    function planLabel(p: PlanOption): string {
        if (p.type === 'commissioner') return `Commissioner — ${p.tier.replace('COMMISSIONER_', '')}`;
        return `Player — ${p.tier.replace('PLAYER_', '')}`;
    }

    return (
        <>
        {showAssignModal && (
            <LeagueAssignModal
                leagues={syncedLeagues}
                plans={availablePlans.map(p => ({ ...p, label: planLabel(p) }))}
                onClose={() => setShowAssignModal(false)}
            />
        )}
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto space-y-6">

                <div>
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold mt-3">Sync Sleeper Leagues</h1>
                    <p className="text-gray-400 text-sm mt-1">Connect your Sleeper leagues to FantasyiQ Trust.</p>
                </div>

                {/* Invite context banner */}
                {fromInvite && inviteLeagueName && (
                    <div className="bg-[#C8A951]/10 border border-[#C8A951]/30 rounded-xl px-4 py-3 flex items-start gap-3">
                        <span className="text-xl shrink-0">🏆</span>
                        <div>
                            <p className="text-[#C8A951] font-semibold text-sm">
                                You were invited to {inviteLeagueName}
                            </p>
                            <p className="text-gray-400 text-xs mt-0.5">
                                Enter your Sleeper username below. We&apos;ll automatically select this league so you can join in one click.
                            </p>
                        </div>
                    </div>
                )}

                {/* Step indicator */}
                <div className="flex items-center gap-2 text-sm">
                    {(['username', 'select', 'done'] as Step[]).map((s, i) => (
                        <span key={s} className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                                step === s ? 'border-[#C8A951] bg-[#C8A951]/20 text-[#C8A951]'
                                : (step === 'select' && s === 'username') || step === 'done'
                                    ? 'border-green-700 bg-green-900/30 text-green-400'
                                    : 'border-gray-700 text-gray-600'
                            }`}>
                                {((step === 'select' && s === 'username') || step === 'done') ? '✓' : i + 1}
                            </span>
                            <span className={step === s ? 'text-white' : 'text-gray-500'}>
                                {s === 'username' ? 'Username' : s === 'select' ? 'Select Leagues' : 'Done'}
                            </span>
                            {i < 2 && <span className="text-gray-700 mx-1">›</span>}
                        </span>
                    ))}
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
                )}

                {/* Step 1 */}
                {step === 'username' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h2 className="font-semibold mb-4">Enter your Sleeper username</h2>
                        <form onSubmit={(e) => { void handleLookup(e); }} className="space-y-4">
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="e.g. russ_ff"
                                required
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951] transition"
                            />
                            <button type="submit" disabled={loading || !username.trim()}
                                className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition">
                                {loading ? 'Looking up…' : 'Find My Leagues'}
                            </button>
                        </form>
                    </div>
                )}

                {/* Step 2 */}
                {step === 'select' && result && (
                    <div className="space-y-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
                            {result.user.avatar ? (
                                <Image src={`https://sleepercdn.com/avatars/thumbs/${result.user.avatar}`}
                                    alt={result.user.display_name} width={40} height={40} className="rounded-full" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-400">
                                    {result.user.display_name[0]?.toUpperCase() ?? '?'}
                                </div>
                            )}
                            <div>
                                <p className="font-semibold">{result.user.display_name}</p>
                                <p className="text-gray-500 text-sm">@{result.user.username} · {result.season} · {result.leagues.length} league{result.leagues.length !== 1 ? 's' : ''}</p>
                            </div>
                        </div>

                        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                                <h2 className="font-semibold">Select leagues to sync</h2>
                                <button type="button" onClick={() => setSelected(
                                    selected.size === result.leagues.length ? new Set() : new Set(result.leagues.map((l) => l.league_id))
                                )} className="text-sm text-[#C8A951] hover:text-[#b8992f] transition">
                                    {selected.size === result.leagues.length ? 'Deselect all' : 'Select all'}
                                </button>
                            </div>
                            {result.leagues.length === 0 ? (
                                <div className="px-5 py-10 text-center text-gray-500 text-sm">No leagues found for {result.season}.</div>
                            ) : (
                                <ul className="divide-y divide-gray-800/50">
                                    {result.leagues.map((league) => {
                                        const isInvited = fromInvite && league.league_id === inviteLeagueId;
                                        return (
                                            <li key={league.league_id} onClick={() => toggleLeague(league.league_id)}
                                                className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition ${isInvited ? 'bg-[#C8A951]/5 hover:bg-[#C8A951]/10' : 'hover:bg-gray-800/30'}`}>
                                                <input type="checkbox" checked={selected.has(league.league_id)}
                                                    onChange={() => toggleLeague(league.league_id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 rounded accent-[#C8A951]" />
                                                {league.avatar ? (
                                                    <Image src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                                        alt={league.name} width={36} height={36} className="rounded-lg shrink-0" />
                                                ) : (
                                                    <div className="w-9 h-9 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center text-gray-600 text-xs font-bold">FF</div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-white truncate">{league.name}</p>
                                                    <p className="text-gray-500 text-xs mt-0.5">{league.total_rosters} teams · {scoringLabel(league)}</p>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-2">
                                                    {isInvited && (
                                                        <span className="text-xs font-semibold text-[#C8A951] bg-[#C8A951]/10 border border-[#C8A951]/30 px-2 py-0.5 rounded-full">
                                                            Invited
                                                        </span>
                                                    )}
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(league.status)}`}>
                                                        {statusLabel(league.status)}
                                                    </span>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button type="button" onClick={() => setStep('username')}
                                className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-5 py-2.5 rounded-lg transition text-sm">
                                Back
                            </button>
                            <button type="button" onClick={() => { void handleSync(); }} disabled={loading || selected.size === 0}
                                className="flex-1 bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition text-sm">
                                {loading ? 'Syncing…' : `Sync ${selected.size} League${selected.size !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3 */}
                {step === 'done' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-4">
                        <div className="text-4xl">✅</div>
                        <h2 className="text-xl font-bold">{synced} league{synced !== 1 ? 's' : ''} synced!</h2>
                        <p className="text-gray-400 text-sm">Standings will refresh hourly. Live scores update every 3 minutes on game days.</p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                            <Link href="/dashboard" className="bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-6 py-2.5 rounded-lg transition text-sm">
                                Go to Dashboard
                            </Link>
                            <button type="button" onClick={() => { setStep('username'); setUsername(''); setResult(null); setSelected(new Set()); setError(''); }}
                                className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-6 py-2.5 rounded-lg transition text-sm">
                                Sync Another Account
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
        </>
    );
}

export default function SyncPage() {
    return (
        <Suspense>
            <SyncPageInner />
        </Suspense>
    );
}
