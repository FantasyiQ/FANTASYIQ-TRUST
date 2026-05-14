'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClaimButton({ commissionerId }: { commissionerId: string }) {
    const router  = useRouter();
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    async function claim() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/lf/commissioners/${commissionerId}/claim`, {
                method: 'POST',
            });
            if (res.ok) {
                router.push(`/leaguefinder/commissioners/${commissionerId}/edit`);
                router.refresh();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error ?? 'Could not claim profile');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-2">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
                onClick={claim}
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
            >
                {loading ? 'Claiming…' : 'Claim This Profile'}
            </button>
        </div>
    );
}
