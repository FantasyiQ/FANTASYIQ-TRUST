'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PLATFORMS = ['sleeper', 'espn', 'yahoo', 'NFL Fantasy'];

export default function RegisterCommissionerForm() {
    const router = useRouter();
    const [displayName, setDisplayName] = useState('');
    const [handles,     setHandles]     = useState<Record<string, string>>({});
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState('');

    async function submit() {
        if (!displayName.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/lf/commissioners', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    displayName,
                    platformHandles: handles,
                }),
            });
            if (res.ok) {
                const data = await res.json() as { id: string };
                router.push(`/leaguefinder/commissioners/${data.id}`);
                router.refresh();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error ?? 'Something went wrong');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                    Commissioner Name <span className="text-red-500">*</span>
                </label>
                <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Russ's Dynasty Empire"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50"
                />
            </div>

            <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                    Platform Handles <span className="text-gray-600">(optional)</span>
                </label>
                <div className="space-y-2">
                    {PLATFORMS.map(p => (
                        <div key={p} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-20 capitalize shrink-0">{p}</span>
                            <input
                                value={handles[p] ?? ''}
                                onChange={e => setHandles(prev => ({ ...prev, [p]: e.target.value }))}
                                placeholder="@handle"
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50"
                            />
                        </div>
                    ))}
                </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
                onClick={submit}
                disabled={loading || !displayName.trim()}
                className="w-full py-3 rounded-xl font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
            >
                {loading ? 'Creating…' : 'Create Commissioner Profile'}
            </button>
        </div>
    );
}
