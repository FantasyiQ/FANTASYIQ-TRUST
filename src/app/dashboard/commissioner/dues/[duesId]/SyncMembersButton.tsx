'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SyncMembersButton({ duesId }: { duesId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [result, setResult]   = useState<string | null>(null);
    const [error, setError]     = useState<string | null>(null);

    async function sync() {
        setLoading(true);
        setResult(null);
        setError(null);
        try {
            const res  = await fetch(`/api/dues/${duesId}/sync-members`, { method: 'POST' });
            const data = await res.json() as { added?: number; message?: string; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Sync failed.');
            } else if ((data.added ?? 0) === 0) {
                setResult(data.message ?? 'All members already synced.');
            } else {
                setResult(`✓ Added ${data.added} member${data.added === 1 ? '' : 's'} from Sleeper.`);
                router.refresh();
            }
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col items-center gap-2">
            <button
                onClick={sync}
                disabled={loading}
                className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-gray-950 font-bold px-5 py-2.5 rounded-xl transition text-sm"
            >
                {loading ? 'Syncing…' : 'Sync Roster from Sleeper'}
            </button>
            {result && <p className="text-green-400 text-xs">{result}</p>}
            {error  && <p className="text-red-400 text-xs max-w-xs text-center">{error}</p>}
        </div>
    );
}
