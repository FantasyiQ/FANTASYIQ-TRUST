'use client';

import BackToOverview from '../../_components/BackToOverview';

interface HistoryRow {
    rank:     number;
    amount:   number;
    teamName: string;
    paidAt:   string | null;
    paidBy:   string;
    season:   string;
}

interface Props {
    leagueId:   string;
    leagueName: string;
    season:     string;
    rows:       HistoryRow[];
}

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th'];

function rankLabel(rank: number): string {
    return RANK_LABELS[rank - 1] ?? `#${rank}`;
}

function fmt(n: number): string {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function PayoutsHistory({ leagueId, leagueName, season, rows }: Props) {
    return (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

            <BackToOverview leagueId={leagueId} />

            <div>
                <h1 className="text-2xl font-bold text-[#D4AF37]">Payout History</h1>
                <p className="text-gray-400 text-sm mt-1">{leagueName} · {season} season</p>
            </div>

            {rows.length === 0 ? (
                /* Empty state */
                <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl px-6 py-10 text-center">
                    <p className="text-[#D4AF37] font-semibold mb-1">No payout history yet for this league.</p>
                    <p className="text-gray-500 text-sm">
                        Record payouts from the{' '}
                        <a
                            href={`/dashboard/league/${leagueId}/payouts`}
                            className="text-[#D4AF37] hover:text-[#D4AF37] underline underline-offset-2"
                        >
                            Payouts Manager
                        </a>
                        .
                    </p>
                </div>
            ) : (
                <div className="bg-[#0A0A0A] border border-[#D4AF37] hover:border-[#D4AF37] rounded-xl overflow-hidden transition-colors">

                    {/* Table header */}
                    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-3 border-b border-white/10 bg-black/30">
                        <span className="text-xs text-gray-600 uppercase tracking-wider">Season</span>
                        <span className="text-xs text-gray-600 uppercase tracking-wider">Team</span>
                        <span className="text-xs text-gray-600 uppercase tracking-wider text-right">Amount</span>
                        <span className="text-xs text-gray-600 uppercase tracking-wider text-right">Status</span>
                    </div>

                    <div className="divide-y divide-white/5">
                        {rows.map(row => (
                            <div
                                key={row.rank}
                                className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-5 py-3.5"
                            >
                                {/* Season + rank */}
                                <div className="text-sm">
                                    <span className="text-gray-400">{row.season}</span>
                                    <span className="ml-2 text-[#D4AF37] font-semibold text-xs">{rankLabel(row.rank)}</span>
                                </div>

                                {/* Team name */}
                                <span className="text-white text-sm font-medium truncate">{row.teamName}</span>

                                {/* Amount */}
                                <span className="text-[#D4AF37] font-bold text-sm text-right">{fmt(row.amount)}</span>

                                {/* Status */}
                                <div className="text-right">
                                    {row.paidAt ? (
                                        <div>
                                            <span className="inline-flex items-center gap-1 bg-[#0F3D2E] border border-emerald-500/40 text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                ✓ Paid
                                            </span>
                                            <p className="text-gray-600 text-xs mt-0.5">
                                                {new Date(row.paidAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    ) : (
                                        <span className="text-amber-400 text-xs font-medium">Pending</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer totals */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/10 bg-black/20">
                        <span className="text-gray-400 text-sm">Total</span>
                        <span className="text-white font-bold text-sm">
                            {fmt(rows.reduce((s, r) => s + r.amount, 0))}
                        </span>
                    </div>
                </div>
            )}

            <a
                href={`/dashboard/league/${leagueId}/payouts`}
                className="block text-center text-sm text-gray-500 hover:text-[#D4AF37] transition-colors"
            >
                ← Back to Payouts Manager
            </a>
        </div>
    );
}
