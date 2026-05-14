'use client';

import { useState } from 'react';
import type { RosterIntelligence, PositionalAnalysis, RosterGrade, DepthTagType, RiskTagType } from '@/lib/projection-engine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pts(n: number) { return n.toFixed(2); }

// ── Grade badge ───────────────────────────────────────────────────────────────

const GRADE_STYLES: Record<RosterGrade, string> = {
    A: 'text-emerald-400 bg-emerald-900/30 border-emerald-700',
    B: 'text-sky-400    bg-sky-900/30     border-sky-700',
    C: 'text-yellow-400 bg-yellow-900/30  border-yellow-700',
    D: 'text-red-400    bg-red-900/30     border-red-700',
};

function GradeBadge({ grade }: { grade: RosterGrade }) {
    return (
        <span className={`text-base font-black w-7 h-7 flex items-center justify-center rounded-lg border shrink-0 ${GRADE_STYLES[grade]}`}>
            {grade}
        </span>
    );
}

// ── Positional tag chip ────────────────────────────────────────────────────────

const TAG_STYLES = {
    major_strength:  'text-emerald-400 bg-emerald-900/20 border-emerald-800',
    slight_strength: 'text-teal-400    bg-teal-900/20    border-teal-800',
    neutral:         'text-gray-500    bg-gray-800/50    border-gray-700',
    slight_weakness: 'text-orange-400  bg-orange-900/20  border-orange-800',
    major_weakness:  'text-red-400     bg-red-900/20     border-red-800',
} as const;

const TAG_LABELS = {
    major_strength:  'Elite',
    slight_strength: 'Solid',
    neutral:         'Average',
    slight_weakness: 'Weak',
    major_weakness:  'Liability',
} as const;

function TagChip({ tag }: { tag: keyof typeof TAG_STYLES }) {
    return (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${TAG_STYLES[tag]}`}>
            {TAG_LABELS[tag]}
        </span>
    );
}

// ── Depth tag ─────────────────────────────────────────────────────────────────

const DEPTH_STYLES: Record<DepthTagType, string> = {
    deep:    'text-emerald-400 bg-emerald-900/20 border-emerald-800',
    average: 'text-gray-400   bg-gray-800/40    border-gray-700',
    thin:    'text-red-400    bg-red-900/20     border-red-800',
};

// ── Risk tag ──────────────────────────────────────────────────────────────────

const RISK_STYLES: Record<RiskTagType, string> = {
    stable:        'text-emerald-400 bg-emerald-900/20 border-emerald-800',
    balanced:      'text-yellow-400  bg-yellow-900/20  border-yellow-800',
    high_variance: 'text-red-400     bg-red-900/20     border-red-800',
};

// ── Positional analysis row ───────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
    QB: 'text-red-400',
    RB: 'text-emerald-400',
    WR: 'text-sky-400',
    TE: 'text-orange-400',
    K:  'text-gray-400',
    DEF:'text-yellow-400',
};

function PositionalRow({ pa }: { pa: PositionalAnalysis }) {
    const pct    = (pa.pctDiff * 100).toFixed(0);
    const sign   = pa.pctDiff >= 0 ? '+' : '';
    const color  = pa.pctDiff >= 0.05 ? 'text-emerald-400' : pa.pctDiff <= -0.05 ? 'text-red-400' : 'text-gray-500';

    return (
        <div className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-800/40 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] font-bold w-10 shrink-0 ${POS_COLORS[pa.player.position] ?? 'text-gray-400'}`}>
                    {pa.slot}
                </span>
                <span className="text-sm text-white truncate">{pa.player.name}</span>
                {(pa.player.injuryStatus && pa.player.injuryStatus !== 'Active') && (
                    <span className="text-[9px] font-bold px-1 rounded border text-yellow-400 border-yellow-700 shrink-0">
                        {pa.player.injuryStatus === 'Questionable' ? 'Q' : pa.player.injuryStatus === 'Doubtful' ? 'D' : pa.player.injuryStatus.slice(0,2)}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-mono text-gray-400">{pts(pa.fiqProj)}</span>
                <span className={`text-[10px] font-mono font-bold w-10 text-right ${color}`}>
                    {sign}{pct}%
                </span>
                <TagChip tag={pa.tag} />
            </div>
        </div>
    );
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({ intel }: { intel: RosterIntelligence }) {
    const [open, setOpen] = useState(false);

    const hasUpgrade = intel.waiverGain > 0.5 || intel.tradeGain > 0.5;

    return (
        <div className={`rounded-xl border transition-colors ${
            intel.grade === 'A' ? 'bg-gray-900 border-emerald-900/40' :
            intel.grade === 'B' ? 'bg-gray-900 border-sky-900/40'     :
            intel.grade === 'D' ? 'bg-gray-900 border-red-900/40'     :
            'bg-gray-900 border-gray-800'
        }`}>
            {/* ── Header (always visible) ────────────────────────────────────── */}
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-800/30 rounded-xl transition"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <GradeBadge grade={intel.grade} />
                    <div className="min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{intel.teamName}</div>
                        {intel.username && (
                            <div className="text-gray-600 text-[11px]">@{intel.username}</div>
                        )}
                    </div>
                    <span className="text-[11px] text-gray-500 shrink-0 hidden sm:block">{intel.tagline}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Depth */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border hidden sm:block ${DEPTH_STYLES[intel.depthTag]}`}>
                        {intel.depthLabel}
                    </span>
                    {/* Risk */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border hidden sm:block ${RISK_STYLES[intel.riskTag]}`}>
                        {intel.riskLabel}
                    </span>
                    {hasUpgrade && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37]">
                            Upgrade Available
                        </span>
                    )}
                    <svg
                        className={`w-4 h-4 text-gray-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* ── Expanded detail ────────────────────────────────────────────── */}
            {open && (
                <div className="px-5 pb-5 border-t border-gray-800 space-y-5 pt-4">

                    {/* Recommended path */}
                    <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]/70 mb-1">Recommended Path</div>
                        <p className="text-sm text-gray-300 leading-relaxed">{intel.recommendedPath}</p>
                    </div>

                    {/* Stat pills row */}
                    <div className="flex flex-wrap gap-2">
                        <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2">
                            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-0.5">Strength</div>
                            <div className="text-sm font-bold text-white font-mono">{(intel.strengthScore * 100).toFixed(0)}%</div>
                        </div>
                        <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2">
                            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-0.5">Bench Depth</div>
                            <div className="text-sm font-bold text-white">{intel.startableBench} startable</div>
                        </div>
                        {intel.waiverGain > 0 && (
                            <div className="rounded-lg bg-gray-800 border border-[#D4AF37]/30 px-3 py-2">
                                <div className="text-[9px] text-[#D4AF37]/70 uppercase tracking-wider mb-0.5">Best Waiver Add</div>
                                <div className="text-sm font-bold text-[#D4AF37] font-mono">+{pts(intel.waiverGain)} pts</div>
                            </div>
                        )}
                        {intel.tradeGain > 0 && (
                            <div className="rounded-lg bg-gray-800 border border-[#D4AF37]/30 px-3 py-2">
                                <div className="text-[9px] text-[#D4AF37]/70 uppercase tracking-wider mb-0.5">Best Trade Gain</div>
                                <div className="text-sm font-bold text-[#D4AF37] font-mono">+{pts(intel.tradeGain)} pts</div>
                            </div>
                        )}
                        <div className={`rounded-lg border px-3 py-2 ${RISK_STYLES[intel.riskTag]}`}>
                            <div className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70">Risk</div>
                            <div className="text-sm font-bold">{intel.riskLabel}</div>
                        </div>
                    </div>

                    {/* Strengths */}
                    {intel.strengths.length > 0 && (
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/70 mb-2">Positional Strengths</div>
                            <div className="rounded-lg bg-gray-800/30 border border-gray-800 px-3 py-1">
                                {intel.strengths.map(pa => (
                                    <PositionalRow key={pa.slot} pa={pa} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Weaknesses */}
                    {intel.weaknesses.length > 0 && (
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-red-500/70 mb-2">Positional Weaknesses</div>
                            <div className="rounded-lg bg-gray-800/30 border border-gray-800 px-3 py-1">
                                {intel.weaknesses.map(pa => (
                                    <PositionalRow key={pa.slot} pa={pa} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Full positional breakdown if no clear strengths/weaknesses */}
                    {intel.strengths.length === 0 && intel.weaknesses.length === 0 && intel.positional.length > 0 && (
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-2">Positional Breakdown</div>
                            <div className="rounded-lg bg-gray-800/30 border border-gray-800 px-3 py-1">
                                {intel.positional.map(pa => (
                                    <PositionalRow key={pa.slot} pa={pa} />
                                ))}
                            </div>
                        </div>
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
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="font-bold text-white mb-1">Roster Intelligence</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Each week RosteriQ grades every team A–D, maps positional strengths and weaknesses
                against league averages, tracks bench depth, and recommends your best path forward.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-4 py-1.5">
                <span className="text-[11px] font-bold text-[#D4AF37]">Active Week 1 · September</span>
            </div>
        </div>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

interface Props {
    intelligence: RosterIntelligence[];
    offSeason:    boolean;
}

export default function RosterIntelligencePanel({ intelligence, offSeason }: Props) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-white">Roster Intelligence</h2>
                <p className="text-gray-500 text-xs mt-0.5">
                    Team grades, positional strengths &amp; weaknesses, depth, and recommended paths — all relative to your league
                </p>
            </div>

            {offSeason ? (
                <OffSeasonPreview />
            ) : intelligence.length === 0 ? (
                <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-10 text-center">
                    <p className="text-gray-500 text-sm">No roster data available yet this week.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {intelligence.map(intel => (
                        <TeamCard key={intel.rosterId} intel={intel} />
                    ))}
                </div>
            )}
        </div>
    );
}
