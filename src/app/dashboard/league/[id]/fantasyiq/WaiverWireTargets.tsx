'use client';

import { useState } from 'react';
import type { TeamWaiverAnalysis, WaiverTarget } from '@/lib/projection-engine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pts(n: number) { return n.toFixed(2); }

function PositionDot({ position }: { position: string }) {
    const colors: Record<string, string> = {
        QB: 'bg-red-500',  RB: 'bg-emerald-500',
        WR: 'bg-sky-500',  TE: 'bg-orange-500',
        K:  'bg-gray-500', DEF: 'bg-yellow-500',
    };
    return (
        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${colors[position] ?? 'bg-gray-600'}`} />
    );
}

function InjuryTag({ status }: { status: string | null }) {
    if (!status || status === 'Active') return null;
    const cls = status === 'Questionable'
        ? 'text-yellow-400 border-yellow-700'
        : 'text-orange-400 border-orange-700';
    return (
        <span className={`text-[9px] font-bold px-1 rounded border ${cls}`}>
            {status === 'Questionable' ? 'Q' : 'D'}
        </span>
    );
}

// ── Waiver target table ───────────────────────────────────────────────────────

function TargetTable({ targets }: { targets: WaiverTarget[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[360px]">
                <thead>
                    <tr className="border-b border-gray-800 text-gray-600 text-[10px] uppercase tracking-wider">
                        <th className="pb-1.5">#</th>
                        <th className="pb-1.5">Free Agent</th>
                        <th className="pb-1.5 text-right">FIQ Proj</th>
                        <th className="pb-1.5 text-right">Gain</th>
                        <th className="pb-1.5">Replaces</th>
                    </tr>
                </thead>
                <tbody>
                    {targets.map((t, i) => (
                        <tr key={t.player.playerId} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition">
                            <td className="py-2 pr-2 text-gray-600 font-mono text-[10px] w-5">{i + 1}</td>
                            <td className="py-2 pr-3">
                                <div className="flex items-center gap-1.5">
                                    <PositionDot position={t.player.position} />
                                    <span className="font-medium text-white truncate max-w-[130px]">{t.player.name}</span>
                                    <InjuryTag status={t.player.injuryStatus} />
                                </div>
                                <div className="text-[10px] text-gray-600 pl-3">
                                    {t.player.team} · {t.player.position}
                                    {t.becomesStarter && (
                                        <span className="ml-1.5 text-[#D4AF37] font-bold">↑ Starts</span>
                                    )}
                                </div>
                            </td>
                            <td className="py-2 text-right font-mono text-gray-300">
                                {pts(t.player.fantasyIqProj)}
                            </td>
                            <td className="py-2 text-right font-mono font-bold text-[#D4AF37]">
                                +{pts(t.waiverGain)}
                            </td>
                            <td className="py-2 pl-3">
                                {t.replaces ? (
                                    <div>
                                        <div className="flex items-center gap-1">
                                            <PositionDot position={t.replaces.position} />
                                            <span className="text-gray-500 truncate max-w-[100px]">{t.replaces.name}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-700 pl-3">
                                            {pts(t.replaces.fantasyIqProj)} proj
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-gray-700">—</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({ analysis }: { analysis: TeamWaiverAnalysis }) {
    const [open, setOpen] = useState(false);

    return (
        <div className={`rounded-xl border transition-colors ${
            !analysis.isAlreadyOptimal
                ? 'bg-gray-900 border-[#D4AF37]/20'
                : 'bg-gray-900 border-gray-800'
        }`}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-800/30 rounded-xl transition"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{analysis.teamName}</div>
                        {analysis.username && (
                            <div className="text-gray-600 text-[11px]">@{analysis.username}</div>
                        )}
                    </div>
                    {analysis.isAlreadyOptimal ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-500 shrink-0">
                            No upgrades found
                        </span>
                    ) : (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] shrink-0">
                            +{pts(analysis.totalGainAvailable)} pts available
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {!analysis.isAlreadyOptimal && (
                        <span className="text-[11px] text-gray-500">
                            {analysis.topTargets.length} target{analysis.topTargets.length !== 1 ? 's' : ''}
                        </span>
                    )}
                    <svg
                        className={`w-4 h-4 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {open && (
                <div className="px-5 pb-5 border-t border-gray-800">
                    {analysis.isAlreadyOptimal ? (
                        <p className="text-gray-600 text-xs py-4 text-center">
                            No available free agents improve this team&apos;s optimized lineup this week.
                        </p>
                    ) : (
                        <>
                            <p className="text-[11px] text-gray-600 py-3">
                                Current optimized proj: <span className="text-gray-300 font-mono font-medium">{pts(analysis.currentOptProj)}</span>
                                {' · '}Best pickup adds <span className="text-[#D4AF37] font-mono font-semibold">+{pts(analysis.totalGainAvailable)}</span>
                            </p>
                            <TargetTable targets={analysis.topTargets} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Off-season preview ────────────────────────────────────────────────────────

function OffSeasonPreview() {
    return (
        <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-8 text-center">
            <div className="text-3xl mb-3">🎯</div>
            <h3 className="font-bold text-white mb-1">Waiver Wire Intelligence</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Every week, FantasyiQ scans every free agent in your league and tells you exactly
                which pickups would improve each team&apos;s optimized lineup — and by how much.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-4 py-1.5">
                <span className="text-[11px] font-bold text-[#D4AF37]">Active Week 1 · September</span>
            </div>
        </div>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

interface Props {
    analyses:  TeamWaiverAnalysis[];
    offSeason: boolean;
}

export default function WaiverWireTargets({ analyses, offSeason }: Props) {
    // Sort: most gain available first
    const sorted = [...analyses].sort((a, b) => b.totalGainAvailable - a.totalGainAvailable);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-white">Waiver Wire Intelligence</h2>
                <p className="text-gray-500 text-xs mt-0.5">
                    Free agents ranked by how much they improve each team&apos;s optimized lineup
                </p>
            </div>

            {offSeason ? (
                <OffSeasonPreview />
            ) : sorted.length === 0 ? (
                <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-10 text-center">
                    <p className="text-gray-500 text-sm">No waiver data available yet this week.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {sorted.map(a => (
                        <TeamCard key={a.rosterId} analysis={a} />
                    ))}
                </div>
            )}
        </div>
    );
}
