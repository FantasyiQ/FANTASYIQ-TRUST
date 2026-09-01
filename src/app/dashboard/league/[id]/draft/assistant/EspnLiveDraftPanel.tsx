'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AvailablePlayersList, { type AvailablePlayer } from './AvailablePlayersList';
import DraftBoardGrid, { type DraftBoardPick } from './DraftBoardGrid';

const POLL_INTERVAL_MS = 15_000;

interface RosterOption { rosterId: string; displayName: string }
interface Meta {
    currentPick:        number;
    currentRound:       number;
    totalRounds:        number;
    onTheClockRosterId: string | null;
}

interface Props { leagueId: string }

export default function EspnLiveDraftPanel({ leagueId }: Props) {
    const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>([]);
    const [picksSoFar,       setPicksSoFar]       = useState<DraftBoardPick[]>([]);
    const [rosterOptions,    setRosterOptions]    = useState<RosterOption[]>([]);
    const [meta,             setMeta]             = useState<Meta | null>(null);
    const [loading,          setLoading]          = useState(true);
    const [error,            setError]            = useState<string | null>(null);
    const [lastUpdated,      setLastUpdated]      = useState<Date | null>(null);

    const fetchDraft = useCallback(async () => {
        setLoading(true);
        try {
            const res  = await fetch(`/api/draft-assistant/espn?leagueId=${leagueId}`);
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Couldn't load ESPN draft data right now.");
                return;
            }
            setAvailablePlayers((data.availablePlayers ?? []).map((p: {
                espnPlayerId: string; name: string; position: string; team: string | null;
                fiqScore: number; tier: number; injuryStatus: string | null;
            }) => ({ ...p, id: p.espnPlayerId, age: null, opportunityScore: null })));
            setPicksSoFar((data.picksSoFar ?? []).map((p: {
                pickOverall: number; round: number; teamId: string; espnPlayerId: string;
                name: string | null; position: string | null;
            }) => ({ pickOverall: p.pickOverall, round: p.round, rosterId: p.teamId, playerId: p.espnPlayerId, name: p.name, position: p.position })));
            setRosterOptions(data.rosterOptions ?? []);
            setMeta(data.meta ?? null);
            setError(null);
            setLastUpdated(new Date());
        } catch {
            setError('Network error — please try again.');
        } finally {
            setLoading(false);
        }
    }, [leagueId]);

    useEffect(() => { void fetchDraft(); }, [fetchDraft]);

    const isLive = !!meta && meta.currentPick <= meta.totalRounds * Math.max(1, rosterOptions.length);
    const pollingRef = useRef(fetchDraft);
    pollingRef.current = fetchDraft;
    useEffect(() => {
        if (!isLive) return;
        const id = setInterval(() => { void pollingRef.current(); }, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [isLive]);

    const [secondsAgo, setSecondsAgo] = useState(0);
    useEffect(() => {
        if (!lastUpdated) return;
        setSecondsAgo(0);
        const id = setInterval(() => setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000)), 1000);
        return () => clearInterval(id);
    }, [lastUpdated]);

    return (
        <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Live Draft</p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { void fetchDraft(); }}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 text-xs hover:text-white hover:border-gray-500 transition disabled:opacity-40"
                        >
                            {loading ? 'Loading…' : '↺ Refresh'}
                        </button>
                        {isLive && (
                            <span className="text-[10px] text-gray-600 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                Live — auto-updates every 15s
                            </span>
                        )}
                        {lastUpdated && <span className="text-[10px] text-gray-600">Updated {secondsAgo}s ago</span>}
                    </div>
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>

            {meta && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 flex items-center gap-3 w-fit">
                    <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Round</p>
                        <p className="text-white font-bold text-lg leading-none">{meta.currentRound}<span className="text-gray-600 text-sm font-normal">/{meta.totalRounds}</span></p>
                    </div>
                    <div className="w-px h-8 bg-gray-800" />
                    <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pick</p>
                        <p className="text-white font-bold text-lg leading-none">{meta.currentPick}</p>
                    </div>
                </div>
            )}

            {meta && (
                <DraftBoardGrid
                    picksSoFar={picksSoFar}
                    rosterOptions={rosterOptions}
                    totalRounds={meta.totalRounds}
                    onTheClockRosterId={meta.onTheClockRosterId}
                />
            )}

            {availablePlayers.length > 0 && (
                <AvailablePlayersList players={availablePlayers} />
            )}
        </div>
    );
}
