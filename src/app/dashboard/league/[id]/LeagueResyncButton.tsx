'use client';

import { useState, useEffect, useCallback } from 'react';

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function storageKey(leagueId: string) {
    return `fantasyiq_sync_${leagueId}`;
}

function remainingMs(leagueId: string): number {
    if (typeof window === 'undefined') return 0;
    const raw = localStorage.getItem(storageKey(leagueId));
    if (!raw) return 0;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return 0;
    const elapsed = Date.now() - ts;
    return Math.max(0, COOLDOWN_MS - elapsed);
}

function RefreshIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" width="14" height="14" style={{ display: 'inline' }}>
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
    );
}

interface Props {
    leagueId: string;       // DB id — used for the API call and localStorage key
    lastSyncedAt: string | null;  // ISO string from server
}

type Phase = 'cooldown' | 'ready' | 'confirm' | 'syncing' | 'done';

export default function LeagueResyncButton({ leagueId, lastSyncedAt }: Props) {
    const [phase, setPhase] = useState<Phase>('ready');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const tick = useCallback(() => {
        const rem = remainingMs(leagueId);
        if (rem > 0) {
            setPhase('cooldown');
        } else {
            setPhase(p => (p === 'cooldown' ? 'ready' : p));
        }
    }, [leagueId]);

    useEffect(() => {
        // Seed localStorage from server value if local has nothing newer
        const serverTs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : null;
        if (serverTs) {
            const existing = localStorage.getItem(storageKey(leagueId));
            if (!existing || parseInt(existing, 10) < serverTs) {
                localStorage.setItem(storageKey(leagueId), String(serverTs));
            }
        }

        tick();
        const interval = setInterval(tick, 60_000);
        return () => clearInterval(interval);
    }, [leagueId, lastSyncedAt, tick]);

    async function fireSync() {
        setPhase('syncing');
        setErrorMsg(null);
        try {
            const res = await fetch(`/api/sleeper/leagues/${leagueId}/refresh`, { method: 'POST' });
            if (res.status === 429) {
                const data = await res.json() as { retryAfter?: number };
                const mins = data.retryAfter ?? 30;
                setPhase('cooldown');
                setErrorMsg(`Synced recently — try again in ${mins} min`);
                setTimeout(() => setErrorMsg(null), 4000);
                return;
            }
            if (!res.ok) {
                const data = await res.json() as { error?: string };
                setErrorMsg(data.error ?? 'Sync failed');
                setTimeout(() => setErrorMsg(null), 4000);
                setPhase('ready');
                return;
            }
            // Success — stamp localStorage and enter Done flash before reload
            localStorage.setItem(storageKey(leagueId), String(Date.now()));
            setPhase('done');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch {
            setErrorMsg('Network error');
            setTimeout(() => setErrorMsg(null), 4000);
            setPhase('ready');
        }
    }

    function handleClick() {
        if (phase === 'ready') setPhase('confirm');
    }

    function handleCancel() {
        setPhase('ready');
    }

    function handleConfirm() {
        void fireSync();
    }

    // ── Confirmation dialog ───────────────────────────────────────────────────
    if (phase === 'confirm') {
        return (
            <div className="flex flex-col items-end gap-2">
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm shadow-lg w-64">
                    <p className="font-semibold text-white mb-1">Sync this league?</p>
                    <p className="text-gray-400 text-xs mb-3">Your leagues sync automatically every hour. Sync now?</p>
                    <div className="flex gap-2 justify-end">
                        <button onClick={handleCancel}
                            className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition">
                            Cancel
                        </button>
                        <button onClick={handleConfirm}
                            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium transition">
                            Sync
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Button states ─────────────────────────────────────────────────────────
    const isCooldown = phase === 'cooldown';
    const isSyncing  = phase === 'syncing';
    const isDone     = phase === 'done';

    const btnClass = isDone
        ? 'bg-yellow-500 text-gray-900 cursor-not-allowed'
        : isCooldown
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
            : isSyncing
                ? 'bg-gray-900 text-yellow-500 opacity-60 cursor-not-allowed'
                : 'bg-gray-900 text-yellow-500 hover:bg-gray-800 cursor-pointer';

    return (
        <div className="flex flex-col items-start gap-1">
            <button
                onClick={handleClick}
                disabled={isCooldown || isSyncing || isDone}
                title="Re-Sync"
                className={`inline-flex items-center justify-center ${btnClass} p-2 rounded-lg transition`}
            >
                {isDone
                    ? <span className="text-base leading-none">✓</span>
                    : isSyncing
                        ? <RefreshIcon className="animate-spin" />
                        : <span className="text-base leading-none">🔄</span>
                }
            </button>
            {errorMsg && (
                <span className="text-red-400 text-xs">{errorMsg}</span>
            )}
        </div>
    );
}
