'use client';

import { useState } from 'react';
import Link from 'next/link';

interface PayoutRow {
    rank:     number;
    amount:   number;
    teamId:   string;
    teamName: string;
    paidAt:   string | null;
}

interface Props {
    leagueId:        string;
    payouts:         PayoutRow[] | null;
    isCommissioner:  boolean;
    hasPayoutSpots:  boolean;
}

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th'];

function rankLabel(rank: number): string {
    return RANK_LABELS[rank - 1] ?? `#${rank}`;
}

function fmt(n: number): string {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function PayoutsWinnersCard({
    leagueId,
    payouts,
    isCommissioner,
    hasPayoutSpots,
}: Props) {
    // Don't render if no payouts and no payout structure and not commissioner
    if (!payouts && !hasPayoutSpots && !isCommissioner) return null;

    const [localPaidAt, setLocalPaidAt] = useState<Record<number, string>>(() => {
        const m: Record<number, string> = {};
        payouts?.forEach(p => { if (p.paidAt) m[p.rank] = p.paidAt; });
        return m;
    });
    const [markingRank, setMarkingRank] = useState<number | null>(null);
    const [markError, setMarkError]     = useState('');

    async function handleMarkPaid(rank: number) {
        setMarkError('');
        setMarkingRank(rank);
        try {
            const res = await fetch(`/api/leagues/${leagueId}/payouts/mark-paid`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ rank }),
            });
            if (res.ok) {
                setLocalPaidAt(prev => ({ ...prev, [rank]: new Date().toISOString() }));
            } else {
                setMarkError('Failed to mark as paid — try again.');
            }
        } catch {
            setMarkError('Network error — please try again.');
        } finally {
            setMarkingRank(null);
        }
    }

    const allPaidOut = payouts && payouts.length > 0 && payouts.every(p => localPaidAt[p.rank] ?? p.paidAt);

    return (
        <div className="bg-[#0A0A0A] border border-[#CBA135] hover:border-[#E2B857] rounded-xl p-5 md:p-7 space-y-4 transition-colors">

            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#CBA135]">Payouts</h2>
                <span className="text-[28px] leading-none select-none">🏆</span>
            </div>

            {/* No payouts recorded yet */}
            {!payouts ? (
                <div className="space-y-3">
                    <div className="rounded-lg bg-[#3D2F0F] border border-amber-500/40 px-4 py-3">
                        <p className="text-amber-200 text-sm">Season results not yet recorded.</p>
                    </div>
                    {isCommissioner && (
                        <Link
                            href={`/dashboard/league/${leagueId}/payouts`}
                            className="text-sm font-semibold text-[#CBA135] hover:text-[#E2B857] transition-colors"
                        >
                            Record payouts →
                        </Link>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Status banner */}
                    {allPaidOut ? (
                        <div className="rounded-lg bg-[#0F3D2E] border border-emerald-500/40 px-4 py-2.5">
                            <p className="text-emerald-400 text-sm font-medium">All winners have been paid.</p>
                        </div>
                    ) : (
                        <div className="rounded-lg bg-[#3D2F0F] border border-amber-500/40 px-4 py-2.5">
                            <p className="text-amber-200 text-sm font-medium">Payouts recorded — pending distribution.</p>
                        </div>
                    )}

                    {/* Winner rows */}
                    <div className="space-y-2">
                        {payouts.map(p => {
                            const paidAt = localPaidAt[p.rank] ?? p.paidAt;
                            const isPaid = !!paidAt;
                            return (
                                <div
                                    key={p.rank}
                                    className="flex items-center justify-between bg-black/40 border border-white/5 rounded-lg px-4 py-3"
                                >
                                    <div>
                                        <p className="text-xs text-gray-500 mb-0.5">{rankLabel(p.rank)}</p>
                                        <p className="text-white font-semibold text-sm">{p.teamName || '—'}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[#CBA135] font-bold text-sm">{fmt(p.amount)}</span>
                                        {isPaid ? (
                                            <span className="inline-flex items-center gap-1 bg-[#0F3D2E] border border-emerald-500/40 text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                ✓ Paid
                                            </span>
                                        ) : isCommissioner ? (
                                            <button
                                                type="button"
                                                disabled={markingRank === p.rank}
                                                onClick={() => { void handleMarkPaid(p.rank); }}
                                                className="text-[#CBA135] hover:text-[#E2B857] text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                                            >
                                                {markingRank === p.rank ? '…' : 'Mark paid →'}
                                            </button>
                                        ) : (
                                            <span className="text-amber-400 text-xs">Pending</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {markError && <p className="text-red-400 text-xs">{markError}</p>}

                    {/* Total */}
                    <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                        <span className="text-gray-400">Total</span>
                        <span className="text-white font-bold">
                            {fmt(payouts.reduce((s, p) => s + p.amount, 0))}
                        </span>
                    </div>

                    {/* Commissioner links */}
                    {isCommissioner && (
                        <div className="flex items-center justify-between pt-1">
                            <Link
                                href={`/dashboard/league/${leagueId}/payouts`}
                                className="text-sm font-semibold text-[#CBA135] hover:text-[#E2B857] transition-colors"
                            >
                                Manage payouts →
                            </Link>
                            <Link
                                href={`/dashboard/league/${leagueId}/payouts/history`}
                                className="text-xs text-gray-500 hover:text-[#CBA135] transition-colors"
                            >
                                View history →
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
