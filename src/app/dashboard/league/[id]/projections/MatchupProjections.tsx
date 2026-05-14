'use client';

import { useState } from 'react';
import type { MatchupProjection, TeamProjection, PlayerProjectionRow } from '@/lib/projection-engine';

// ── Small helpers ─────────────────────────────────────────────────────────────

function pts(n: number) {
    return n.toFixed(2);
}

function pct(n: number) {
    return `${Math.round(n * 100)}%`;
}

function injuryBadge(status: string | null) {
    if (!status || status === 'Active') return null;
    const color =
        status === 'Questionable' ? 'text-yellow-400 border-yellow-700 bg-yellow-900/20' :
        status === 'Doubtful'     ? 'text-orange-400 border-orange-700 bg-orange-900/20' :
        /* Out / IR / PUP */        'text-red-400   border-red-800    bg-red-900/20';
    return (
        <span className={`ml-1.5 px-1.5 py-0.5 text-[9px] font-bold tracking-wide rounded border uppercase ${color}`}>
            {status === 'Questionable' ? 'Q' : status === 'Doubtful' ? 'D' : status}
        </span>
    );
}

// ── Player table ──────────────────────────────────────────────────────────────

function PlayerTable({ players, scoringType }: { players: PlayerProjectionRow[]; scoringType: string | null }) {
    const label = scoringType === 'ppr' ? 'PPR' : scoringType === 'half_ppr' ? 'Half PPR' : 'Std';
    const starters = players.filter(p => p.isStarter);
    const bench    = players.filter(p => !p.isStarter);

    const Row = ({ p }: { p: PlayerProjectionRow }) => (
        <tr className="border-b border-gray-800/60 hover:bg-gray-800/20 transition">
            <td className="py-2 pr-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-gray-500 w-8 shrink-0">{p.position}</span>
                    <span className="text-sm font-medium text-white truncate max-w-[120px]">{p.name}</span>
                    {injuryBadge(p.injuryStatus)}
                </div>
                {p.team && <div className="text-[10px] text-gray-600 ml-9">{p.team}</div>}
            </td>
            <td className="py-2 text-right text-sm font-mono">
                <span className={p.livePts > 0 ? 'text-white' : 'text-gray-600'}>{pts(p.livePts)}</span>
            </td>
            <td className="py-2 text-right text-sm font-mono text-gray-400">{pts(p.baseProj)}</td>
            <td className="py-2 text-right text-sm font-mono text-gray-400">
                {p.rosProj > 0 ? pts(p.rosProj) : <span className="text-gray-700">—</span>}
            </td>
            <td className="py-2 text-right text-sm font-mono">
                <span className={p.fantasyIqProj < p.baseProj ? 'text-red-400' : p.fantasyIqProj > p.baseProj ? 'text-emerald-400' : 'text-[#D4AF37]'}>
                    {pts(p.fantasyIqProj)}
                </span>
            </td>
        </tr>
    );

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[340px]">
                <thead>
                    <tr className="border-b border-gray-800 text-gray-600 text-[10px] uppercase tracking-wider">
                        <th className="pb-1.5 pr-2">Player</th>
                        <th className="pb-1.5 text-right">Live</th>
                        <th className="pb-1.5 text-right">{label} Proj</th>
                        <th className="pb-1.5 text-right">ROS</th>
                        <th className="pb-1.5 text-right">FIQ</th>
                    </tr>
                </thead>
                <tbody>
                    {starters.map(p => <Row key={p.playerId} p={p} />)}
                    {bench.length > 0 && (
                        <>
                            <tr>
                                <td colSpan={5} className="pt-3 pb-1">
                                    <span className="text-[10px] font-bold tracking-widest text-gray-700 uppercase">Bench</span>
                                </td>
                            </tr>
                            {bench.map(p => (
                                <tr key={p.playerId} className="border-b border-gray-800/30">
                                    <td className="py-1.5 pr-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-bold text-gray-700 w-8 shrink-0">{p.position}</span>
                                            <span className="text-xs text-gray-600 truncate max-w-[120px]">{p.name}</span>
                                            {injuryBadge(p.injuryStatus)}
                                        </div>
                                    </td>
                                    <td className="py-1.5 text-right text-xs font-mono text-gray-700">{pts(p.livePts)}</td>
                                    <td className="py-1.5 text-right text-xs font-mono text-gray-700">{pts(p.baseProj)}</td>
                                    <td className="py-1.5 text-right text-xs font-mono text-gray-700">—</td>
                                    <td className="py-1.5 text-right text-xs font-mono text-gray-700">{pts(p.fantasyIqProj)}</td>
                                </tr>
                            ))}
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ── Win probability bar ───────────────────────────────────────────────────────

function WinProbBar({ probA, nameA, nameB }: { probA: number; nameA: string; nameB: string }) {
    const pA = Math.round(probA * 100);
    const pB = 100 - pA;
    return (
        <div className="w-full">
            <div className="flex justify-between text-[11px] font-bold mb-1">
                <span className="text-[#D4AF37]">{pA}%</span>
                <span className="text-gray-500 text-center text-[10px] font-normal">Win Probability</span>
                <span className="text-gray-400">{pB}%</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-gray-800">
                <div className="bg-[#D4AF37] transition-all duration-700" style={{ width: `${pA}%` }} />
                <div className="bg-gray-600 transition-all duration-700" style={{ width: `${pB}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span className="truncate max-w-[45%]">{nameA}</span>
                <span className="truncate max-w-[45%] text-right">{nameB}</span>
            </div>
        </div>
    );
}

// ── Team summary card ─────────────────────────────────────────────────────────

function TeamCard({
    team,
    side,
    winProb,
    scoringType,
}: {
    team:        TeamProjection;
    side:        'left' | 'right';
    winProb:     number;
    scoringType: string | null;
}) {
    const [open, setOpen] = useState(false);
    const isLeading = winProb >= 0.5;

    return (
        <div className={`flex-1 min-w-0 flex flex-col gap-3 ${side === 'right' ? 'items-end text-right' : ''}`}>
            {/* Team name + win indicator */}
            <div className={`flex items-center gap-2 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
                <div className="min-w-0">
                    <div className="font-bold text-white text-sm truncate">{team.teamName}</div>
                    {team.username && <div className="text-gray-500 text-[11px]">@{team.username}</div>}
                </div>
                {isLeading && (
                    <span className="shrink-0 text-[10px] font-bold text-[#D4AF37] border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-1.5 py-0.5 rounded-full">
                        Favored
                    </span>
                )}
            </div>

            {/* Score stack */}
            <div>
                <div className="text-3xl font-bold text-white tabular-nums">{pts(team.teamLive)}</div>
                <div className="text-[11px] text-gray-500 mt-0.5 space-y-0.5">
                    <div>Sleeper proj: <span className="text-gray-300 font-medium">{pts(team.teamProjFinal)}</span></div>
                    <div>FIQ proj: <span className="text-[#D4AF37] font-semibold">{pts(team.teamProjEnhanced)}</span></div>
                </div>
            </div>

            {/* Roster expand toggle */}
            <button
                onClick={() => setOpen(v => !v)}
                className="text-[11px] text-gray-500 hover:text-gray-300 transition flex items-center gap-1"
            >
                {open ? 'Hide' : 'Show'} roster
                <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div className="w-full text-left">
                    <PlayerTable players={team.players} scoringType={scoringType} />
                </div>
            )}
        </div>
    );
}

// ── Matchup card ──────────────────────────────────────────────────────────────

function MatchupCard({ matchup, scoringType }: { matchup: MatchupProjection; scoringType: string | null }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
            {/* Header row */}
            <div className="flex items-start gap-4">
                <TeamCard team={matchup.teamA} side="left"  winProb={matchup.winProbA}       scoringType={scoringType} />

                <div className="shrink-0 flex flex-col items-center gap-1 pt-1">
                    <span className="text-xs font-bold text-gray-600 tracking-widest">VS</span>
                    <span className="text-[10px] text-gray-700">Wk {matchup.week}</span>
                </div>

                <TeamCard team={matchup.teamB} side="right" winProb={1 - matchup.winProbA}   scoringType={scoringType} />
            </div>

            {/* Win probability bar */}
            <WinProbBar
                probA={matchup.winProbA}
                nameA={matchup.teamA.teamName}
                nameB={matchup.teamB.teamName}
            />
        </div>
    );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
    return (
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-3">
            <p className="text-[11px] text-gray-600 leading-relaxed">
                <span className="text-gray-400 font-semibold">How it works:</span>{' '}
                <strong className="text-gray-300">Live</strong> = current fantasy points.{' '}
                <strong className="text-gray-300">Proj</strong> = Sleeper&apos;s pre-game projection.{' '}
                <strong className="text-gray-300">ROS</strong> = rest-of-game projection (Proj − Live, floor 0).{' '}
                <strong className="text-[#D4AF37]">FIQ</strong> = FantasyiQ enhanced projection — applies injury,
                opponent defensive rank, and positional volatility modifiers to the Sleeper baseline.{' '}
                Win probability is computed via a normal distribution using each team&apos;s positional variance.
            </p>
        </div>
    );
}

// ── Off-season preview ────────────────────────────────────────────────────────

function OffSeasonPreview({ season }: { season: string }) {
    return (
        <div className="space-y-6">
            {/* Season start callout */}
            <div className="rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-6 py-8 text-center">
                <div className="text-4xl mb-3">🏈</div>
                <h2 className="text-xl font-bold text-white mb-1">Ready for the {season} Season</h2>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                    Weekly projections go live when the NFL season kicks off. Come back in September
                    and you&apos;ll see live matchup projections, rest-of-game scores, and win probabilities for every game.
                </p>
            </div>

            {/* What you'll see section */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <h3 className="font-semibold text-white">What you&apos;ll see in-season</h3>
                <div className="grid sm:grid-cols-3 gap-3">
                    {[
                        { icon: '📊', title: 'Live Matchup View',    desc: 'Real-time scores vs. projected finals for every matchup in your league.' },
                        { icon: '🎯', title: 'Rest-of-Game Proj.',   desc: 'How many points each starter is still expected to score this week.' },
                        { icon: '📈', title: 'Win Probability',       desc: 'Variance-based model showing each team\'s chance of winning their matchup.' },
                    ].map(card => (
                        <div key={card.title} className="rounded-xl bg-gray-800/50 border border-gray-700/50 p-4">
                            <div className="text-2xl mb-2">{card.icon}</div>
                            <div className="font-semibold text-white text-sm mb-1">{card.title}</div>
                            <div className="text-gray-500 text-xs leading-relaxed">{card.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

interface Props {
    matchups:    MatchupProjection[];
    week:        number;
    season:      string;
    scoringType: string | null;
    offSeason?:  boolean;
}

export default function MatchupProjections({ matchups, week, season, scoringType, offSeason }: Props) {
    const label = scoringType === 'ppr'
        ? 'PPR'
        : scoringType === 'half_ppr'
        ? 'Half PPR'
        : 'Standard';

    if (offSeason) {
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-white">Weekly Projections</h1>
                    <div className="text-right">
                        <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>

                    </div>
                </div>
                <OffSeasonPreview season={season} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Weekly Projections</h1>
                    <p className="text-gray-500 text-sm mt-0.5">
                        {season} Season · Week {week} · {label}
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37] mb-0.5">FantasyiQ</div>

                </div>
            </div>

            {/* Matchup cards */}
            {matchups.length === 0 ? (
                <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-12 text-center">
                    <p className="text-gray-500 text-sm">No matchup data available for Week {week}.</p>
                    <p className="text-gray-700 text-xs mt-1">Check back once the week&apos;s games have been scheduled.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {matchups.map(m => (
                        <MatchupCard key={m.matchupId} matchup={m} scoringType={scoringType} />
                    ))}
                </div>
            )}

            <Legend />
        </div>
    );
}
