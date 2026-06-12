'use client';

import { useState } from 'react';

interface Props {
    leagueDbId:      string;
    sleeperLeagueId: string | null;
    leagueName:      string;
    season:          string;
    hasDues:         boolean;
}

export default function CommissionerQuickActions({
    leagueDbId, sleeperLeagueId, leagueName, season, hasDues,
}: Props) {
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteCopied, setInviteCopied]   = useState(false);
    const [duesCopied, setDuesCopied]       = useState(false);

    async function copyInviteLink() {
        if (!sleeperLeagueId) return;
        setInviteLoading(true);
        try {
            const res  = await fetch(`/api/leagues/${sleeperLeagueId}/invite`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueName, season }),
            });
            const data = await res.json() as { path?: string };
            if (res.ok && data.path) {
                await navigator.clipboard.writeText(`${window.location.origin}${data.path}`);
                setInviteCopied(true);
                setTimeout(() => setInviteCopied(false), 2500);
            }
        } finally {
            setInviteLoading(false);
        }
    }

    async function copyDuesLink() {
        const url = `${window.location.origin}/dashboard/league/${leagueDbId}/dues/pay`;
        await navigator.clipboard.writeText(url);
        setDuesCopied(true);
        setTimeout(() => setDuesCopied(false), 2500);
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-600 text-[11px] font-medium uppercase tracking-wide shrink-0">
                Commish
            </span>

            {sleeperLeagueId && (
                <button
                    onClick={copyInviteLink}
                    disabled={inviteLoading}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${
                        inviteCopied
                            ? 'bg-green-900/40 text-green-400 border-green-800'
                            : 'bg-gray-800/60 text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                    }`}
                >
                    {inviteCopied ? '✓ Invite Link Copied' : inviteLoading ? 'Generating…' : '🔗 Copy Invite Link'}
                </button>
            )}

            {hasDues && (
                <button
                    onClick={copyDuesLink}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                        duesCopied
                            ? 'bg-green-900/40 text-green-400 border-green-800'
                            : 'bg-gray-800/60 text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                    }`}
                >
                    {duesCopied ? '✓ Dues Link Copied' : '💰 Copy Dues Link'}
                </button>
            )}
        </div>
    );
}
