'use client';

import { useState } from 'react';
import ReviewForm   from '@/components/leaguefinder/ReviewForm';

interface Props {
    commissionerId: string;
    leagues: { id: string; name: string }[];
}

export default function ReviewFormWrapper({ commissionerId, leagues }: Props) {
    const [open,             setOpen]             = useState(false);
    const [selectedLeagueId, setSelectedLeagueId] = useState(leagues[0]?.id ?? '');

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full py-2.5 rounded-xl border border-[#D4AF37]/40 text-[#D4AF37] font-semibold text-sm hover:bg-[#D4AF37]/10 transition"
            >
                Leave a Review
            </button>
        );
    }

    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-white">Leave a Review</h3>
                <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-400 text-sm transition">✕</button>
            </div>

            {leagues.length > 1 && (
                <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Which league?</label>
                    <select
                        value={selectedLeagueId}
                        onChange={e => setSelectedLeagueId(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#D4AF37]/60"
                    >
                        {leagues.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                </div>
            )}

            <ReviewForm
                leagueId={selectedLeagueId}
                commissionerId={commissionerId}
                onSuccess={() => setOpen(false)}
            />
        </div>
    );
}
