'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PLATFORMS = ['sleeper', 'espn', 'yahoo', 'nfl fantasy'];

interface Props {
    commissionerId:     string;
    initialDisplayName: string;
    initialHandles:     Record<string, string>;
}

export default function EditCommissionerForm({ commissionerId, initialDisplayName, initialHandles }: Props) {
    const router  = useRouter();
    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [handles,     setHandles]     = useState<Record<string, string>>(initialHandles);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState('');
    const [saved,       setSaved]       = useState(false);

    async function save() {
        setLoading(true);
        setError('');
        setSaved(false);
        try {
            const res = await fetch(`/api/lf/commissioners/${commissionerId}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ displayName, platformHandles: handles }),
            });
            if (res.ok) {
                setSaved(true);
                router.refresh();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error ?? 'Error saving');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-5">
            {/* Display name */}
            <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                    Display Name
                </label>
                <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                />
            </div>

            {/* Platform handles */}
            <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                    Platform Handles
                </label>
                <div className="space-y-2">
                    {PLATFORMS.map(p => (
                        <div key={p} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-20 capitalize shrink-0">{p}</span>
                            <input
                                value={handles[p] ?? ''}
                                onChange={e => setHandles(prev => ({ ...prev, [p]: e.target.value }))}
                                placeholder={`@handle`}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                            />
                        </div>
                    ))}
                </div>
            </div>

            {error  && <p className="text-sm text-red-400">{error}</p>}
            {saved  && <p className="text-sm text-emerald-400">✓ Saved successfully</p>}

            <button
                onClick={save}
                disabled={loading || !displayName.trim()}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
            >
                {loading ? 'Saving…' : 'Save Changes'}
            </button>
        </div>
    );
}
