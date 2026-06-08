'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DelistButton({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
    const router   = useRouter();
    const [step,    setStep]    = useState<'idle' | 'confirm'>('idle');
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    async function handleDelist() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/lf/leagues/${leagueId}`, { method: 'DELETE' });
            if (res.ok) {
                router.push('/leaguefinder');
                router.refresh();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error ?? 'Something went wrong');
                setStep('idle');
            }
        } catch {
            setError('Network error');
            setStep('idle');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-4 space-y-3">
            <div>
                <p className="text-sm font-bold text-red-400">Delist League</p>
                <p className="text-xs text-gray-500 mt-0.5">
                    Permanently removes this league from League Finder. Season history, reviews, and
                    waitlist data will be deleted. This cannot be undone.
                </p>
            </div>

            {step === 'idle' ? (
                <button
                    onClick={() => setStep('confirm')}
                    className="px-4 py-2 rounded-lg text-xs font-bold border border-red-800 text-red-400 hover:bg-red-900/30 transition"
                >
                    Remove Listing
                </button>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-red-300">
                        Are you sure? &ldquo;{leagueName}&rdquo; will be permanently removed.
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setStep('idle')}
                            disabled={loading}
                            className="px-4 py-2 rounded-lg text-xs font-bold border border-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelist}
                            disabled={loading}
                            className="px-4 py-2 rounded-lg text-xs font-bold bg-red-700 text-white hover:bg-red-600 transition disabled:opacity-50"
                        >
                            {loading ? 'Delisting…' : 'Yes, Remove It'}
                        </button>
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
    );
}
