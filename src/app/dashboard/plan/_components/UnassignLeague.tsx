'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UnassignLeague({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
    const router = useRouter();
    const [confirm, setConfirm] = useState(false);
    const [saving,  setSaving]  = useState(false);

    async function handleUnassign() {
        setSaving(true);
        try {
            await fetch(`/api/leagues/${leagueId}/assign`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: null, planType: null }),
            });
            router.refresh();
        } finally {
            setSaving(false);
            setConfirm(false);
        }
    }

    if (confirm) {
        return (
            <span className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">Remove <span className="text-white font-medium">{leagueName}</span>?</span>
                <button
                    type="button"
                    onClick={() => { void handleUnassign(); }}
                    disabled={saving}
                    className="text-red-400 hover:text-red-300 font-semibold transition disabled:opacity-50"
                >
                    {saving ? 'Removing…' : 'Yes, remove'}
                </button>
                <button type="button" onClick={() => setConfirm(false)} className="text-gray-500 hover:text-gray-300 transition">
                    Cancel
                </button>
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={() => setConfirm(true)}
            className="text-xs text-gray-500 hover:text-red-400 transition"
        >
            Unassign
        </button>
    );
}
