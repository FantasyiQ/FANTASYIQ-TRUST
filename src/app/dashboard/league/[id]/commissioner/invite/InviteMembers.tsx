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
    const [token,           setToken]           = useState<string | null>(existingToken);
    const [loading,         setLoading]         = useState(false);
    const [error,           setError]           = useState<string | null>(null);
    const [copied,          setCopied]          = useState(false);
    const [confirmRegen,    setConfirmRegen]    = useState(false);

    const inviteUrl = token
        ? `${typeof window !== 'undefined' ? window.location.origin : 'https://fantasyiqtrust.com'}/invite/${token}`
        : null;

    const canShare = typeof navigator !== 'undefined' && !!navigator.share;

    async function generate() {
        setLoading(true);
        setError(null);
        setConfirmRegen(false);
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

    async function share() {
        if (!inviteUrl || !navigator.share) return;
        try {
            await navigator.share({
                title: `Join ${leagueName} on FantasyiQ Trust`,
                text:  `Your commissioner invited you to track dues, payouts, and standings for ${leagueName}.`,
                url:   inviteUrl,
            });
        } catch {
            // user cancelled — no-op
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold">Invite Members</h2>
                <p className="text-gray-500 text-sm mt-0.5">{leagueName} · {season}</p>
            </div>

            {/* Commissioner plan coverage callout */}
            <div className="bg-[#D4AF37]/8 border border-[#D4AF37]/25 rounded-xl px-5 py-4 text-sm text-gray-300 space-y-1 max-w-lg">
                <p><span className="text-[#D4AF37] font-semibold">Commissioner Plans cover the entire league.</span> All members get access at no additional cost.</p>
                <p>Members must join via your invite link for the league plan to apply.</p>
                <p className="text-gray-500">Player Plans are optional personal upgrades and are never required.</p>
            </div>

            {/* Invite link card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4 max-w-lg">
                <p className="text-sm text-gray-400">
                    Share this link with your league members. They'll create a free account and land directly in{' '}
                    <span className="text-white font-medium">{leagueName}</span> automatically.
                </p>

                {inviteUrl ? (
                    <div className="space-y-3">
                        {/* Link display + copy */}
                        <div className="flex items-center gap-2 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5">
                            <span className="text-sm text-gray-300 flex-1 truncate font-mono">{inviteUrl}</span>
                            <button
                                onClick={copy}
                                className="text-xs font-bold text-[#D4AF37] hover:text-[#BF9D2F] whitespace-nowrap transition"
                            >
                                {copied ? '✓ Copied!' : 'Copy'}
                            </button>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={copy}
                                disabled={loading}
                                className="flex-1 min-w-[120px] bg-[#D4AF37] hover:bg-[#BF9D2F] text-black font-bold text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50"
                            >
                                {copied ? '✓ Link Copied' : '📋 Copy Link'}
                            </button>
                            {canShare && (
                                <button
                                    onClick={share}
                                    disabled={loading}
                                    className="flex-1 min-w-[120px] bg-gray-800 hover:bg-gray-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg border border-gray-700 transition disabled:opacity-50"
                                >
                                    ↗ Share
                                </button>
                            )}
                        </div>

                        {/* Regenerate — with warning */}
                        {!confirmRegen ? (
                            <button
                                onClick={() => setConfirmRegen(true)}
                                className="text-xs text-gray-600 hover:text-gray-400 transition"
                            >
                                Regenerate link
                            </button>
                        ) : (
                            <div className="rounded-lg border border-amber-900/40 bg-amber-900/10 px-4 py-3 space-y-2">
                                <p className="text-xs text-amber-300 font-medium">
                                    ⚠ This will invalidate the current link. Anyone who hasn't joined yet will need the new link.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={generate}
                                        disabled={loading}
                                        className="text-xs font-bold text-amber-400 hover:text-amber-300 transition disabled:opacity-50"
                                    >
                                        {loading ? 'Regenerating…' : 'Yes, regenerate'}
                                    </button>
                                    <button
                                        onClick={() => setConfirmRegen(false)}
                                        className="text-xs text-gray-500 hover:text-gray-300 transition"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={generate}
                        disabled={loading}
                        className="bg-[#D4AF37] text-black font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-[#BF9D2F] transition disabled:opacity-50"
                    >
                        {loading ? 'Generating…' : 'Generate Invite Link'}
                    </button>
                )}

                {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>

            {/* What members will see */}
            <div className="max-w-lg rounded-xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">What members see when they click</p>
                <ul className="space-y-2 text-sm text-gray-500">
                    <li className="flex items-start gap-2">
                        <span className="text-[#D4AF37] shrink-0 mt-0.5">✓</span>
                        <span>League name, season, and a clear explanation of FantasyiQ Trust</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-[#D4AF37] shrink-0 mt-0.5">✓</span>
                        <span>Sign in or create a free account — they're taken straight into your league</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-[#D4AF37] shrink-0 mt-0.5">✓</span>
                        <span>No payment required — your Commissioner Plan covers them automatically</span>
                    </li>
                </ul>
            </div>
        </div>
    );
}
