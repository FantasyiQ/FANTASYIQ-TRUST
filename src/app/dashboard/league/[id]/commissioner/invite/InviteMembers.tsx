'use client';

import { useState } from 'react';

interface Props {
    leagueId:        string;
    sleeperLeagueId: string;
    leagueName:      string;
    season:          string;
    existingToken:   string | null;
}

export default function InviteMembers({ leagueId, sleeperLeagueId, leagueName, season, existingToken }: Props) {
    const [token,   setToken]   = useState<string | null>(existingToken);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [copied,  setCopied]  = useState(false);

    const inviteUrl = token ? `${window.location.origin}/invite/${token}` : null;

    async function generate() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/leagues/${sleeperLeagueId}/invite`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueName, season }),
            });
            if (!res.ok) {
                const { error: msg } = await res.json() as { error?: string };
                setError(msg ?? 'Failed to generate invite link.');
                return;
            }
            const { path } = await res.json() as { path: string };
            setToken(path.replace('/invite/', ''));
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    async function copy() {
        if (!inviteUrl) return;
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold">Invite Members</h2>
                <p className="text-gray-500 text-sm mt-0.5">{leagueName} · {season}</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4 max-w-lg">
                <p className="text-sm text-gray-400">
                    Share this link with your league members so they can create a FantasyIQ account and join your league automatically.
                </p>

                {inviteUrl ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2">
                            <span className="text-sm text-gray-300 flex-1 truncate">{inviteUrl}</span>
                            <button
                                onClick={copy}
                                className="text-xs font-medium text-[#C8A951] hover:underline whitespace-nowrap"
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <button
                            onClick={generate}
                            disabled={loading}
                            className="text-xs text-gray-500 hover:text-gray-300 transition disabled:opacity-50"
                        >
                            {loading ? 'Regenerating…' : 'Regenerate link'}
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={generate}
                        disabled={loading}
                        className="bg-[#C8A951] text-black font-semibold text-sm px-4 py-2 rounded-lg hover:bg-[#b8993f] transition disabled:opacity-50"
                    >
                        {loading ? 'Generating…' : 'Generate Invite Link'}
                    </button>
                )}

                {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
        </div>
    );
}
