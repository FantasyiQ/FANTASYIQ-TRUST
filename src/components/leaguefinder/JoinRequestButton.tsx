'use client';

import { useState } from 'react';
import TrustScoreCard from '@/components/leaguefinder/TrustScoreCard';

interface Props {
    leagueId:     string;
    leagueName:   string;
    initialStatus: string | null; // PENDING | ACCEPTED | REJECTED | PINNED | null
    userPrsScore?: number;        // caller passes current user's PRS for "Why can't I join?" card
}

export default function JoinRequestButton({ leagueId, leagueName, initialStatus, userPrsScore }: Props) {
    const [status,    setStatus]    = useState(initialStatus);
    const [open,      setOpen]      = useState(false);
    const [message,   setMessage]   = useState('');
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');
    const [prsBlocked, setPrsBlocked] = useState(false);

    async function submit() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/lf/leagues/${leagueId}/join-request`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ introMessage: message }),
            });
            if (res.ok) {
                setStatus('PENDING');
                setOpen(false);
            } else {
                const data = await res.json() as { error?: string };
                if (res.status === 403 && data.error?.toLowerCase().includes('reliability score')) {
                    setPrsBlocked(true);
                    setOpen(false);
                } else {
                    setError(data.error ?? 'Something went wrong');
                }
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }

    if (prsBlocked && userPrsScore !== undefined) {
        return (
            <div className="space-y-3">
                <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3">
                    <p className="text-sm font-bold text-red-400 mb-0.5">Your Trust Score is too low for this league.</p>
                    <p className="text-xs text-red-300/70">Here's what you need to do to qualify.</p>
                </div>
                <TrustScoreCard prsScore={userPrsScore} />
            </div>
        );
    }

    if (status === 'PENDING') {
        return (
            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-4 py-3 text-sm text-[#D4AF37]">
                ✓ You're on the waitlist — the commissioner will review your request.
            </div>
        );
    }
    if (status === 'ACCEPTED') {
        return (
            <div className="rounded-xl border border-emerald-800 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-400">
                ✓ Your request was accepted!
            </div>
        );
    }
    if (status === 'REJECTED') {
        return (
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-500">
                Your join request was not accepted this time.
            </div>
        );
    }

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition"
            >
                Request to Join
            </button>
        );
    }

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">Request to join {leagueName}</h3>
            <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                    Tell the commissioner about yourself (optional)
                </label>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Years of experience, play style, what you're looking for..."
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#D4AF37]/50"
                />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
                <button
                    onClick={submit}
                    disabled={loading}
                    className="flex-1 py-2 rounded-lg font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
                >
                    {loading ? 'Sending…' : 'Submit Request'}
                </button>
                <button
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 transition"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
