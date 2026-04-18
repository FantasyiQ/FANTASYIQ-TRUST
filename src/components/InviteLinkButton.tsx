'use client';

import { useState } from 'react';

interface Props {
    sleeperLeagueId: string;
    leagueName: string;
    season: string;
}

export default function InviteLinkButton({ sleeperLeagueId, leagueName, season }: Props) {
    const [inviteUrl, setInviteUrl]         = useState<string | null>(null);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [copied, setCopied]               = useState(false);

    async function generateInvite() {
        setInviteLoading(true);
        try {
            const res = await fetch(`/api/leagues/${sleeperLeagueId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueName, season }),
            });
            const data = await res.json() as { path?: string; error?: string };
            if (res.ok && data.path) {
                // Build the full URL from the current origin so it always
                // uses the correct production domain, not an env var.
                setInviteUrl(`${window.location.origin}${data.path}`);
            }
        } catch {
            // silently fail
        } finally {
            setInviteLoading(false);
        }
    }

    async function copyInvite() {
        if (!inviteUrl) return;
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-gray-300 text-sm font-medium">Invite Members</p>
                <span className="text-gray-600 text-xs">Commissioner only</span>
            </div>
            <p className="text-gray-500 text-xs">Share with league members so they can sign up and view this league on FantasyIQ Trust.</p>
            {inviteUrl ? (
                <div className="flex items-center gap-2">
                    <input
                        readOnly
                        value={inviteUrl}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-xs font-mono focus:outline-none"
                    />
                    <button
                        onClick={copyInvite}
                        className={`shrink-0 text-xs font-bold px-3 py-2 rounded-lg transition border ${
                            copied
                                ? 'bg-green-900/40 text-green-400 border-green-800'
                                : 'bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 border-[#C8A951]'
                        }`}
                    >
                        {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                </div>
            ) : (
                <button
                    onClick={generateInvite}
                    disabled={inviteLoading}
                    className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-gray-950 font-bold px-4 py-2 rounded-lg text-sm transition"
                >
                    {inviteLoading ? 'Generating…' : '+ Invite Members'}
                </button>
            )}
        </div>
    );
}
