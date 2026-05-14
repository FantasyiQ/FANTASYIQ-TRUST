'use client';

import { useState } from 'react';
import Link from 'next/link';
import { prsTier, PRS_TIER_LABELS, PRS_TIER_STYLES } from '@/lib/lf-prs-display';

interface Requester {
    id:              string;
    name:            string | null;
    trustScore:      number;
    prsScore:        number;
    verifiedSeasons: number;
}

interface Request {
    id:          string;
    status:      string;
    introMessage: string | null;
    createdAt:   string;
    user:        Requester;
}

export default function WaitlistManager({ requests: initial }: { requests: Request[] }) {
    const [requests, setRequests] = useState(initial);
    const [loading,  setLoading]  = useState<string | null>(null);

    async function setStatus(id: string, status: string) {
        setLoading(id);
        try {
            const res = await fetch(`/api/lf/join-requests/${id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ status }),
            });
            if (res.ok) {
                setRequests(prev =>
                    status === 'ACCEPTED' || status === 'REJECTED'
                        ? prev.filter(r => r.id !== id)
                        : prev.map(r => r.id === id ? { ...r, status } : r)
                );
            }
        } finally {
            setLoading(null);
        }
    }

    // Sort: PINNED first, then by prsScore desc (most reliable player at top)
    const sorted = [...requests].sort((a, b) => {
        if (a.status === 'PINNED' && b.status !== 'PINNED') return -1;
        if (b.status === 'PINNED' && a.status !== 'PINNED') return  1;
        return b.user.prsScore - a.user.prsScore;
    });

    return (
        <div className="space-y-3">
            {sorted.map(r => (
                <div key={r.id} className={`rounded-xl border p-4 space-y-3 ${
                    r.status === 'PINNED'
                        ? 'border-[#D4AF37]/40 bg-[#D4AF37]/5'
                        : 'border-gray-800 bg-gray-900'
                }`}>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <Link
                                href={`/leaguefinder/users/${r.user.id}`}
                                className="text-sm font-bold text-white hover:text-[#D4AF37] transition"
                            >
                                {r.user.name ?? 'Anonymous'}
                            </Link>
                            {r.status === 'PINNED' && (
                                <span className="ml-2 text-[9px] font-bold text-[#D4AF37]">📌 PINNED</span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <PRSChip score={r.user.prsScore} />
                            <StatChip label="Trust" value={r.user.trustScore} />
                            <StatChip label="Verified" value={r.user.verifiedSeasons} />
                        </div>
                    </div>

                    {/* Intro message */}
                    {r.introMessage && (
                        <p className="text-xs text-gray-400 leading-relaxed bg-gray-800/60 rounded-lg px-3 py-2">
                            "{r.introMessage}"
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            onClick={() => setStatus(r.id, 'ACCEPTED')}
                            disabled={!!loading}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/50 transition disabled:opacity-50"
                        >
                            Accept
                        </button>
                        <button
                            onClick={() => setStatus(r.id, 'REJECTED')}
                            disabled={!!loading}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/30 transition disabled:opacity-50"
                        >
                            Reject
                        </button>
                        <button
                            onClick={() => setStatus(r.id, r.status === 'PINNED' ? 'PENDING' : 'PINNED')}
                            disabled={!!loading}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500 transition disabled:opacity-50"
                        >
                            {r.status === 'PINNED' ? 'Unpin' : '📌 Pin'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

function StatChip({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center gap-1 px-2 py-1 rounded border border-gray-700 bg-gray-800">
            <span className="text-[9px] text-gray-500">{label}</span>
            <span className="text-[10px] font-bold text-white">{value}</span>
        </div>
    );
}

function PRSChip({ score }: { score: number }) {
    const tier   = prsTier(score);
    const label  = PRS_TIER_LABELS[tier];
    const styles = PRS_TIER_STYLES[tier];
    return (
        <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-bold cursor-help ${styles}`}
            title={`Player Reliability Score: ${score}/100 (${label})\nBuilt from verified seasons, league retention, helpful votes, and commissioner approvals.`}
        >
            <span className="text-[9px] opacity-70">PRS</span>
            <span>{score}</span>
            <span className="opacity-70">· {label}</span>
        </div>
    );
}
