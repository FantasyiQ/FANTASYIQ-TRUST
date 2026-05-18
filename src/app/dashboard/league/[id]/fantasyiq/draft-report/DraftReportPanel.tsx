'use client';

import { useState, useCallback } from 'react';
import type { DraftReportCard, PickAlignment, PickGrade } from '@/lib/draft/reportCard';

interface DraftOption {
    draftId: string;
    label:   string;
    status:  string;
    rounds:  number;
    teams:   number;
    season:  string;
}

interface RosterOption {
    rosterId:    string;
    displayName: string;
    ownerId:     string | null;
}

interface Props {
    leagueId:      string;
    draftOptions:  DraftOption[];
    rosterOptions: RosterOption[];
    myRosterId:    string | null;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const GRADE_BG: Record<PickGrade, string> = {
    'A+': 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40',
    'A':  'bg-green-900/40 text-green-300 border-green-700/60',
    'B':  'bg-blue-900/40 text-blue-300 border-blue-700/60',
    'C':  'bg-gray-800 text-gray-300 border-gray-600',
    'D':  'bg-orange-900/30 text-orange-400 border-orange-700/40',
    'F':  'bg-red-900/30 text-red-400 border-red-700/40',
};

const TRAJ_LABEL: Record<string, string> = {
    WIN_NOW:   'WIN‑NOW',
    ASCENDING: 'ASCENDING',
    PLATEAU:   'PLATEAU',
    REBUILD:   'REBUILD',
};

const TRAJ_COLOR: Record<string, string> = {
    WIN_NOW:   'text-red-300',
    ASCENDING: 'text-emerald-300',
    PLATEAU:   'text-gray-400',
    REBUILD:   'text-indigo-300',
};

const POS_COLORS: Record<string, string> = {
    QB: 'bg-red-900/40 text-red-300 border-red-700/60',
    RB: 'bg-blue-900/40 text-blue-300 border-blue-700/60',
    WR: 'bg-green-900/40 text-green-300 border-green-700/60',
    TE: 'bg-orange-900/40 text-orange-300 border-orange-700/60',
};

function posBadge(pos: string) { return POS_COLORS[pos] ?? 'bg-gray-800 text-gray-400 border-gray-700'; }

function tierBadge(tier: number) {
    if (tier === 1) return 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40';
    if (tier === 2) return 'bg-green-900/40 text-green-300 border-green-700/60';
    if (tier === 3) return 'bg-blue-900/40 text-blue-300 border-blue-700/60';
    return 'bg-gray-800 text-gray-500 border-gray-700';
}

function scoreBar(value: number, max = 5) {
    const pct = (value / max) * 100;
    const color = value >= 4 ? 'bg-green-500' : value >= 3 ? 'bg-blue-500' : value >= 2 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

function coreGradeColor(grade: string) {
    if (grade === 'A') return 'text-[#D4AF37]';
    if (grade === 'B') return 'text-green-400';
    if (grade === 'C') return 'text-blue-400';
    if (grade === 'D') return 'text-orange-400';
    return 'text-red-400';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PickCard({ pick, idx }: { pick: PickAlignment; idx: number }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
                type="button"
                className="w-full text-left p-4"
                onClick={() => setOpen(o => !o)}
            >
                <div className="flex items-start gap-3">
                    {/* Pick label */}
                    <div className="shrink-0 text-center min-w-[40px]">
                        <p className="text-[10px] text-gray-600 uppercase">Pick</p>
                        <p className="text-xs font-bold text-gray-400">{pick.round}.{String(pick.pickInRound).padStart(2, '0')}</p>
                    </div>
                    {/* Player */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${posBadge(pick.position)}`}>{pick.position}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tierBadge(pick.tier)}`}>T{pick.tier}</span>
                            <span className="text-white font-semibold text-sm">{pick.playerName}</span>
                            {pick.team && <span className="text-gray-500 text-xs">{pick.team}</span>}
                            {pick.age && <span className="text-gray-600 text-xs">Age {pick.age}</span>}
                        </div>
                        <p className="text-gray-500 text-xs mt-1">{pick.gradeNote}</p>
                    </div>
                    {/* Grade */}
                    <div className={`shrink-0 text-center px-2.5 py-1 rounded border font-bold text-sm ${GRADE_BG[pick.grade]}`}>
                        {pick.grade}
                    </div>
                </div>
            </button>

            {open && (
                <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-3">
                    {/* Alignment breakdown */}
                    <div className="grid grid-cols-5 gap-2">
                        {[
                            { label: 'Tier Fit', value: pick.tierFit },
                            { label: 'Mode Fit', value: pick.modeFit },
                            { label: 'Traj. Fit', value: pick.trajectoryFit },
                            { label: 'Need Fit', value: pick.needFit },
                            { label: 'Opp Fit', value: pick.opportunityFit },
                        ].map(({ label, value }) => (
                            <div key={label} className="text-center">
                                <p className="text-[10px] text-gray-600 mb-1">{label}</p>
                                {scoreBar(value)}
                                <p className="text-xs font-bold text-gray-400 mt-1">{value}/5</p>
                            </div>
                        ))}
                    </div>
                    {/* VOP + BPA context */}
                    <div className="flex gap-4 text-xs text-gray-500">
                        <span>
                            VOP: <span className={pick.vop >= 0 ? 'text-green-400' : 'text-orange-400'}>
                                {pick.vop >= 0 ? '+' : ''}{pick.vop}
                            </span>
                        </span>
                        {pick.bpaTierAtPick != null && (
                            <span>BPA tier at pick: <span className="text-gray-300">T{pick.bpaTierAtPick}</span></span>
                        )}
                        {pick.opportunityScore != null && (
                            <span>Opp Score: <span className="text-gray-300">{pick.opportunityScore}</span></span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function TierBar({ label, count, avg, max }: { label: string; count: number; avg: number; max: number }) {
    const pct = max > 0 ? (count / max) * 100 : 0;
    const avgPct = max > 0 ? (avg / max) * 100 : 0;
    const colors: Record<string, string> = {
        T1: 'bg-[#D4AF37]', T2: 'bg-green-500', T3: 'bg-blue-500', T4: 'bg-gray-500', T5: 'bg-gray-700',
    };
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-6 shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-gray-800 rounded-full relative overflow-visible">
                <div className={`h-full rounded-full ${colors[label] ?? 'bg-gray-500'}`} style={{ width: `${pct}%` }} />
                {/* League avg marker */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-500 rounded"
                    style={{ left: `${avgPct}%` }}
                />
            </div>
            <span className="text-xs text-gray-300 w-4 text-right shrink-0">{count}</span>
            <span className="text-[10px] text-gray-600 w-8 text-right shrink-0">≈{avg.toFixed(1)} avg</span>
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function DraftReportPanel({
    leagueId, draftOptions, rosterOptions, myRosterId,
}: Props) {
    const [selectedDraftId,  setSelectedDraftId]  = useState(draftOptions[0]?.draftId ?? '');
    const [selectedRosterId, setSelectedRosterId] = useState(myRosterId ?? rosterOptions[0]?.rosterId ?? '');
    const [report,           setReport]           = useState<DraftReportCard | null>(null);
    const [loading,          setLoading]          = useState(false);
    const [error,            setError]            = useState<string | null>(null);

    const fetchReport = useCallback(async () => {
        if (!selectedDraftId || !selectedRosterId) return;
        setLoading(true);
        setError(null);
        try {
            const url = `/api/draft-report?leagueId=${leagueId}&sleeperDraftId=${selectedDraftId}&myRosterId=${selectedRosterId}`;
            const res  = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Failed to load report');
            setReport(data.reportCard);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load report');
        } finally {
            setLoading(false);
        }
    }, [leagueId, selectedDraftId, selectedRosterId]);

    if (draftOptions.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-2">
                <p className="text-white font-semibold">No Completed Drafts</p>
                <p className="text-gray-500 text-sm">Complete a draft to generate your FiQ Draft Report Card.</p>
            </div>
        );
    }

    const p = report?.draftProfile;
    const f = report?.franchise;
    const tierMax = Math.max(
        ...(report ? [
            report.tierDistribution.T1,
            report.tierDistribution.T2,
            report.tierDistribution.T3,
            report.tierDistribution.leagueAvg.T1,
            report.tierDistribution.leagueAvg.T2,
            report.tierDistribution.leagueAvg.T3,
        ] : [1])
    );

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">FiQ Draft Report Card</p>
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1">
                        <label className="text-gray-500 text-xs block">Draft</label>
                        <select
                            value={selectedDraftId}
                            onChange={e => { setSelectedDraftId(e.target.value); setReport(null); }}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gray-500 min-w-[200px]"
                        >
                            {draftOptions.map(d => (
                                <option key={d.draftId} value={d.draftId}>
                                    {d.label} ({d.season}, {d.teams}-team)
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-gray-500 text-xs block">Team</label>
                        <select
                            value={selectedRosterId}
                            onChange={e => { setSelectedRosterId(e.target.value); setReport(null); }}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gray-500 min-w-[160px]"
                        >
                            {rosterOptions.map(r => (
                                <option key={r.rosterId} value={r.rosterId}>{r.displayName}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={fetchReport}
                        disabled={loading || !selectedDraftId || !selectedRosterId}
                        className="px-4 py-1.5 rounded-lg bg-[#D4AF37] text-black text-xs font-bold hover:bg-[#BF9D2F] transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Generating…' : 'Generate Report'}
                    </button>
                    {report && (
                        <button
                            onClick={fetchReport}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 text-xs hover:text-white hover:border-gray-500 transition disabled:opacity-40"
                        >
                            ↺ Refresh
                        </button>
                    )}
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>

            {report && (
                <>
                    {/* ── Draft Identity ─────────────────────────────────────────────────── */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                        <div className="flex items-start gap-4">
                            <div className={`shrink-0 text-2xl font-black px-4 py-2 rounded-xl border ${GRADE_BG[report.identityGrade]}`}>
                                {report.identityGrade}
                            </div>
                            <div>
                                <p className="text-white font-semibold text-sm">{report.identity}</p>
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                    <span className="text-gray-500 text-xs">Avg alignment: {report.avgScore}/25</span>
                                    <span className={`text-xs font-semibold ${report.totalVop >= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                        Total VOP: {report.totalVop >= 0 ? '+' : ''}{report.totalVop}
                                    </span>
                                    {p && (
                                        <>
                                            <span className="text-xs text-gray-600">
                                                Mode: <span className="text-gray-400">{p.teamMode.replace('_', ' ')}</span>
                                            </span>
                                            <span className={`text-xs font-medium ${TRAJ_COLOR[p.trajectoryWindow]}`}>
                                                Trajectory: {TRAJ_LABEL[p.trajectoryWindow]} ({p.horizonYears}-yr)
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Tier Distribution ─────────────────────────────────────────────── */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                        <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Tier Distribution</p>
                        <div className="space-y-2">
                            {(['T1', 'T2', 'T3', 'T4', 'T5'] as const).map(t => (
                                <TierBar
                                    key={t}
                                    label={t}
                                    count={report.tierDistribution[t] ?? 0}
                                    avg={report.tierDistribution.leagueAvg[t] ?? 0}
                                    max={tierMax + 0.5}
                                />
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-600">Gray marker = league average. Your picks vs. the room.</p>
                    </div>

                    {/* ── Pick-by-Pick Cards ─────────────────────────────────────────────── */}
                    {report.picks.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                                Pick-by-Pick Alignment — tap to expand
                            </p>
                            {report.picks.map((pick, i) => (
                                <PickCard key={pick.sleeperPlayerId || pick.playerName} pick={pick} idx={i} />
                            ))}
                        </div>
                    )}

                    {/* ── State of the Franchise ────────────────────────────────────────── */}
                    {f && (
                        <div className="space-y-3">
                            <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">State of the Franchise</p>

                            {/* Competitive window + win delta */}
                            <div className="flex gap-3 flex-wrap">
                                <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Competitive Window</p>
                                        <p className={`font-bold text-sm leading-none mt-0.5 ${TRAJ_COLOR[f.trajectoryWindow] ?? 'text-white'}`}>
                                            {TRAJ_LABEL[f.trajectoryWindow] ?? f.trajectoryWindow}
                                        </p>
                                        <p className="text-gray-600 text-[10px]">{f.horizonYears}-year horizon</p>
                                    </div>
                                    <div className="w-px h-10 bg-gray-800" />
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Roster Score</p>
                                        <p className="text-white font-bold text-lg leading-none">{f.overallScore}</p>
                                    </div>
                                    <div className="w-px h-10 bg-gray-800" />
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Draft Impact</p>
                                        <p className={`font-bold text-sm leading-none mt-0.5 ${f.winProbabilityDelta >= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                            {f.winProbabilityDelta >= 0 ? '+' : ''}{f.winProbabilityDelta}%
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Core Strength Index */}
                            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-3">Core Strength Index</p>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {f.coreStrength.map(cs => (
                                        <div key={cs.position} className="text-center">
                                            <p className="text-gray-500 text-xs mb-1">{cs.label}</p>
                                            <p className={`text-2xl font-black ${coreGradeColor(cs.grade)}`}>{cs.grade}</p>
                                            <p className="text-gray-600 text-[10px]">FiQ {cs.avgFiq} · {cs.count} players</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Positional Stability + Age Curve */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Positional Stability</p>
                                    {f.positionStability.stable.length > 0 && (
                                        <div>
                                            <span className="text-[10px] text-green-500 font-bold uppercase">Stable: </span>
                                            <span className="text-gray-300 text-xs">{f.positionStability.stable.join(', ')}</span>
                                        </div>
                                    )}
                                    {f.positionStability.fragile.length > 0 && (
                                        <div>
                                            <span className="text-[10px] text-yellow-500 font-bold uppercase">Fragile: </span>
                                            <span className="text-gray-300 text-xs">{f.positionStability.fragile.join(', ')}</span>
                                        </div>
                                    )}
                                    {f.positionStability.critical.length > 0 && (
                                        <div>
                                            <span className="text-[10px] text-red-500 font-bold uppercase">Critical: </span>
                                            <span className="text-gray-300 text-xs">{f.positionStability.critical.join(', ')}</span>
                                        </div>
                                    )}
                                    {f.positionStability.stable.length === 0 &&
                                     f.positionStability.fragile.length === 0 &&
                                     f.positionStability.critical.length === 0 && (
                                        <p className="text-gray-600 text-xs">No stability data available</p>
                                    )}
                                </div>
                                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Age Curve</p>
                                    {[
                                        { label: 'Young Core',  count: f.ageCurve.young, color: 'text-emerald-400' },
                                        { label: 'Prime Core',  count: f.ageCurve.prime, color: 'text-blue-400'    },
                                        { label: 'Aging Core',  count: f.ageCurve.aging, color: 'text-orange-400'  },
                                    ].map(({ label, count, color }) => (
                                        <div key={label} className="flex justify-between items-center">
                                            <span className="text-gray-500 text-xs">{label}</span>
                                            <span className={`font-bold text-sm ${color}`}>{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Dynasty Outlook */}
                            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-2">Dynasty Outlook</p>
                                <p className="text-gray-300 text-sm leading-relaxed">{f.dynastyOutlook}</p>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
