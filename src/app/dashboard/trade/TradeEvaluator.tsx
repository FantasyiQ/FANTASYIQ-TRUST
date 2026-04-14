'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { PLAYERS, getDraftPicks, evaluateTrade, calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, PprFormat, LeagueType, DtvResult, LeagueSettings } from '@/lib/trade-engine';

const LEAGUE_SIZES = [8, 10, 12, 14, 16, 32] as const;
type LeagueSize = typeof LEAGUE_SIZES[number];

// Dynamic pick years: before ~April 25 current year is still tradeable; after, shift forward
function pickYears(): [number, number, number] {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const pastDraft = m > 4 || (m === 4 && d >= 25);
    const base = pastDraft ? now.getFullYear() + 1 : now.getFullYear();
    return [base, base + 1, base + 2];
}
const PICK_YEARS = pickYears();

const TIER_COLORS: Record<string, string> = {
    Elite:   'text-[#C8A951]',
    Star:    'text-green-400',
    Starter: 'text-blue-400',
    Flex:    'text-gray-300',
    Bench:   'text-orange-400',
    Waiver:  'text-red-400',
};

const POS_COLORS: Record<string, string> = {
    QB:   'bg-red-900/40 text-red-300 border-red-800',
    RB:   'bg-green-900/40 text-green-300 border-green-800',
    WR:   'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:   'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    K:    'bg-gray-800 text-gray-400 border-gray-700',
    DEF:  'bg-purple-900/40 text-purple-300 border-purple-800',
    PICK: 'bg-indigo-900/40 text-indigo-300 border-indigo-700',
};

function verdictColor(v: string) {
    switch (v) {
        case 'Slam Dunk':  return 'text-[#C8A951]';
        case 'Strong Win': return 'text-green-400';
        case 'Slight Edge':return 'text-green-300';
        case 'Fair Trade': return 'text-gray-300';
        case 'Slight Loss':return 'text-orange-400';
        case 'Bad Deal':   return 'text-red-400';
        case 'Robbery':    return 'text-red-600';
        default:           return 'text-gray-400';
    }
}

const INSIGHT_COLORS: Record<string, string> = {
    'Rookie Deal':          'bg-emerald-900/50 text-emerald-300 border-emerald-800',
    '5th-Year Option':      'bg-emerald-900/40 text-emerald-400 border-emerald-800',
    'Walk Year':            'bg-orange-900/50 text-orange-300 border-orange-800',
    'Free Agent':           'bg-red-900/50 text-red-300 border-red-800',
    'Prime RB Age':         'bg-[#C8A951]/10 text-[#C8A951] border-[#C8A951]/30',
    'RB Decline Risk':      'bg-red-900/40 text-red-400 border-red-800',
    'WR Prime':             'bg-[#C8A951]/10 text-[#C8A951] border-[#C8A951]/30',
    'Aging WR':             'bg-orange-900/40 text-orange-400 border-orange-800',
    'QB Prime':             'bg-[#C8A951]/10 text-[#C8A951] border-[#C8A951]/30',
    'TE Prime':             'bg-[#C8A951]/10 text-[#C8A951] border-[#C8A951]/30',
    'Aging TE':             'bg-orange-900/40 text-orange-400 border-orange-800',
    'TE Target Hog':        'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    'Pass-Heavy Offense':   'bg-blue-900/40 text-blue-300 border-blue-800',
    'High-Powered Offense': 'bg-blue-900/40 text-blue-300 border-blue-800',
    'Run-First Scheme':     'bg-green-900/40 text-green-300 border-green-800',
    'Heavy Workload':       'bg-green-900/40 text-green-300 border-green-800',
    'Top-10 Pedigree':      'bg-purple-900/40 text-purple-300 border-purple-800',
    'High Draft Capital':   'bg-purple-900/30 text-purple-400 border-purple-800',
    'UDFA Ascent':          'bg-indigo-900/40 text-indigo-300 border-indigo-800',
};

function InsightBadge({ label }: { label: string }) {
    return (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${INSIGHT_COLORS[label] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
            {label}
        </span>
    );
}

function FactorBar({ label, value, max = 1.30 }: { label: string; value: number; max?: number }) {
    const pct = Math.min(100, Math.round((value / max) * 100));
    const color = value >= 1.10 ? 'bg-[#C8A951]' : value >= 0.98 ? 'bg-green-500' : value >= 0.88 ? 'bg-orange-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2">
            <span className="text-gray-600 text-[10px] w-16 shrink-0">{label}</span>
            <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-gray-500 text-[10px] w-8 text-right">{value.toFixed(2)}×</span>
        </div>
    );
}

function PlayerPill({ result, onRemove, leagueType }: { result: DtvResult; onRemove: () => void; leagueType: LeagueType }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md border shrink-0 ${POS_COLORS[result.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                        {result.position}
                    </span>
                    <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{result.name}</p>
                        <p className="text-gray-500 text-xs">{result.position === 'PICK' ? `${result.team} Draft` : `${result.team}${result.age ? ` · Age ${result.age}` : ''}`}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                        <p className={`font-bold text-sm ${TIER_COLORS[result.tier]}`}>{result.finalDtv}</p>
                        <p className="text-gray-600 text-xs">{result.tier}</p>
                    </div>
                    {result.position !== 'PICK' && (
                        <button
                            onClick={() => setExpanded(v => !v)}
                            className="text-gray-600 hover:text-gray-300 transition text-xs px-1"
                            title="Show factors">
                            {expanded ? '▲' : '▼'}
                        </button>
                    )}
                    <button onClick={onRemove} className="text-gray-700 hover:text-red-400 transition text-lg leading-none">×</button>
                </div>
            </div>

            {/* Insight badges */}
            {result.insights && result.insights.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {result.insights.map(i => <InsightBadge key={i} label={i} />)}
                </div>
            )}

            {/* Expanded factor breakdown */}
            {expanded && result.position !== 'PICK' && (
                <div className="space-y-1 pt-1 border-t border-gray-700">
                    <FactorBar label="Position"  value={result.posMultiplier} />
                    <FactorBar label="Age Curve"  value={result.ageMultiplier} />
                    <FactorBar label="Scheme"     value={result.schedFactor} />
                    <FactorBar label="Contract"   value={result.situFactor} />
                    {leagueType === 'Dynasty' && <FactorBar label="Draft Cap"  value={result.draftCapFactor} />}
                </div>
            )}
        </div>
    );
}

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

function RosterQuickPick({ players, picks = [], excluded, ppr, leagueType, settings = DEFAULT_LEAGUE_SETTINGS, onAdd, rosterLabel = 'My Roster' }: {
    players:      Player[];
    picks?:       Player[];
    excluded:     string[];
    ppr:          PprFormat;
    leagueType:   LeagueType;
    settings?:    LeagueSettings;
    onAdd:        (p: Player) => void;
    rosterLabel?: string;
}) {
    const [tab, setTab]           = useState<'roster' | 'picks'>('roster');
    const [pickYear, setPickYear] = useState(PICK_YEARS[0]);

    const sorted = useMemo(() =>
        [...players].sort((a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9)),
        [players]
    );

    const yearPicks = useMemo(() =>
        picks.filter(p => p.team === String(pickYear)),
        [picks, pickYear]
    );

    // group by round number (pick name starts with "YYYY R.")
    const rounds = useMemo(() => {
        const map = new Map<number, Player[]>();
        for (const p of yearPicks) {
            const round = parseInt(p.name.split(' ')[1]?.split('.')[0] ?? '1', 10);
            if (!map.has(round)) map.set(round, []);
            map.get(round)!.push(p);
        }
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    }, [yearPicks]);

    const tabBtn = (id: 'roster' | 'picks', label: string) => (
        <button type="button" onClick={() => setTab(id)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${
                tab === id
                    ? 'bg-[#C8A951] text-black border-[#C8A951]'
                    : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'
            }`}>
            {label}
        </button>
    );

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                {tabBtn('roster', rosterLabel)}
                {picks.length > 0 && tabBtn('picks', 'Draft Picks')}
            </div>

            {tab === 'roster' && (
                <div className="flex flex-wrap gap-1.5">
                    {sorted.map(p => {
                        const used = excluded.includes(p.name);
                        const dtv  = calcDtv(p, ppr, leagueType, undefined, settings);
                        return (
                            <button key={p.name} type="button" disabled={used} onClick={() => onAdd(p)}
                                title={`${p.name} — DTV ${dtv.finalDtv}`}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                                    used
                                        ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                                        : 'border-gray-700 text-gray-300 hover:border-[#C8A951]/60 hover:text-white'
                                }`}>
                                <span className={`font-bold ${POS_COLORS[p.position] ?? ''} px-1 rounded text-[10px]`}>
                                    {p.position}
                                </span>
                                {p.name.split(' ').pop()}
                                <span className="text-gray-600">{dtv.finalDtv}</span>
                            </button>
                        );
                    })}
                    {sorted.length === 0 && <p className="text-gray-700 text-xs italic">No roster players found in trade engine</p>}
                </div>
            )}

            {tab === 'picks' && picks.length > 0 && (
                <div className="space-y-2">
                    {/* Year tabs */}
                    <div className="flex gap-1.5">
                        {PICK_YEARS.map(y => (
                            <button key={y} type="button" onClick={() => setPickYear(y)}
                                className={`px-2.5 py-0.5 rounded text-xs font-semibold border transition ${
                                    pickYear === y
                                        ? 'bg-indigo-900/60 text-indigo-300 border-indigo-700'
                                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'
                                }`}>
                                {y}
                            </button>
                        ))}
                    </div>
                    {/* Picks by round */}
                    <div className="space-y-1.5">
                        {rounds.map(([round, roundPicks]) => (
                            <div key={round} className="flex items-center gap-2 flex-wrap">
                                <span className="text-gray-600 text-[10px] font-semibold w-8 shrink-0">Rd {round}</span>
                                {roundPicks.map(p => {
                                    const used = excluded.includes(p.name);
                                    const dtv  = calcDtv(p, ppr, leagueType, undefined, settings);
                                    const slot = p.name.split(' ')[1]; // e.g. "1.03"
                                    return (
                                        <button key={p.name} type="button" disabled={used} onClick={() => onAdd(p)}
                                            title={`${p.name} — DTV ${dtv.finalDtv}`}
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium transition ${
                                                used
                                                    ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                                                    : 'border-indigo-800/60 text-indigo-300 hover:border-indigo-500 hover:text-white'
                                            }`}>
                                            {slot}
                                            <span className="text-gray-600">{dtv.finalDtv}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function PlayerSearch({ onAdd, excluded, ppr, leagueType, settings = DEFAULT_LEAGUE_SETTINGS, players }: {
    onAdd: (p: Player) => void;
    excluded: string[];
    ppr: PprFormat;
    leagueType: LeagueType;
    settings?: LeagueSettings;
    players: Player[];
}) {
    const [query, setQuery]     = useState('');
    const [results, setResults] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = useCallback(async (q: string) => {
        if (q.length < 2) { setResults([]); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/players/trade-search?q=${encodeURIComponent(q)}`);
            const data = await res.json() as Player[];
            setResults(data.filter(p => !excluded.includes(p.name)));
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [excluded]);

    function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
        const val = e.target.value;
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { void search(val); }, 250);
    }

    // Keep roster quick-pick working (still searches local players array)
    const localResults = useMemo(() => {
        if (query.length >= 2) return [];
        return players;
    }, [query, players]);
    void localResults; // unused — roster picks handled by RosterQuickPick

    return (
        <div className="relative">
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={handleInput}
                    placeholder="Search any NFL player…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                />
                {loading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">…</span>
                )}
            </div>
            {results.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl max-h-64 overflow-y-auto">
                    {results.map(p => {
                        const dtv = calcDtv(p, ppr, leagueType, undefined, settings);
                        return (
                            <li key={p.name}>
                                <button
                                    onMouseDown={() => { onAdd(p); setQuery(''); setResults([]); }}
                                    className="w-full flex items-start justify-between px-4 py-2.5 hover:bg-gray-700 transition text-left gap-3">
                                    <div className="flex items-start gap-2 min-w-0">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${POS_COLORS[p.position] ?? ''}`}>
                                            {p.position}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-white text-sm truncate">{p.name}</span>
                                                <span className="text-gray-500 text-xs">{p.team}</span>
                                            </div>
                                            {dtv.insights && dtv.insights.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                    {dtv.insights.map(i => <InsightBadge key={i} label={i} />)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className={`text-sm font-bold ${TIER_COLORS[dtv.tier]}`}>{dtv.finalDtv}</span>
                                        <span className="text-gray-600 text-xs ml-1">{dtv.tier}</span>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export interface TradeTeam {
    rosterId: number;
    teamName: string;
    players:  Player[];
    picks:    Player[];
}

interface TradeEvaluatorProps {
    initialPpr?:            PprFormat;
    initialLeagueSize?:     LeagueSize;
    initialLeagueType?:     LeagueType;
    initialLeagueSettings?: LeagueSettings;
    leagueLabel?:           string;
    myRoster?:              Player[];
    myTeam?:                TradeTeam;
    otherTeams?:            TradeTeam[];
}

export default function TradeEvaluator({
    initialPpr            = 0.5,
    initialLeagueSize     = 12,
    initialLeagueType     = 'Redraft',
    initialLeagueSettings = DEFAULT_LEAGUE_SETTINGS,
    leagueLabel,
    myRoster              = [],
    myTeam,
    otherTeams            = [],
}: TradeEvaluatorProps = {}) {
    const [ppr, setPpr]                         = useState<PprFormat>(initialPpr);
    const [leagueType, setLeagueType]           = useState<LeagueType>(initialLeagueType);
    const [leagueSize, setLeagueSize]           = useState<LeagueSize>(initialLeagueSize);
    const [leagueSettings, setLeagueSettings]   = useState<LeagueSettings>(initialLeagueSettings);
    const superflex = leagueSettings.sfSlots > 0;
    const [posFilter, setPosFilter]   = useState('ALL');
    const [pickYear, setPickYear]     = useState(PICK_YEARS[0]);
    const [sideA, setSideA]           = useState<Player[]>([]);
    const [sideB, setSideB]           = useState<Player[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(otherTeams[0]?.rosterId ?? null);
    const [fcMap, setFcMap] = useState<Record<string, { dynasty: number; redraft: number }>>({});

    // Load live FantasyCalc values (cached 1hr on CDN)
    useEffect(() => {
        fetch('/api/players/fc-values')
            .then(r => r.json())
            .then((data: Record<string, { dynasty: number; redraft: number }>) => {
                setFcMap(data);
            })
            .catch(() => {/* ignore — fall back to hardcoded baseValues */});
    }, []);

    // Patch baseValue with live FC data — use dynasty or redraft value to match league type
    const patchPlayer = useCallback((p: Player): Player => {
        const fc = fcMap[p.name.toLowerCase()];
        if (!fc) return p;
        const fcVal = leagueType === 'Dynasty' ? fc.dynasty : fc.redraft;
        // Use FC value only if it's higher than half the hardcoded value,
        // preventing stale/low community data from tanking elite players
        return fcVal > p.baseValue * 0.4 ? { ...p, baseValue: fcVal } : p;
    }, [fcMap, leagueType]);

    const allExcluded = [...sideA.map(p => p.name), ...sideB.map(p => p.name)];

    const draftPicks = useMemo(() => getDraftPicks(leagueSize), [leagueSize]);
    const allPlayers = useMemo(
        () => [...PLAYERS.map(patchPlayer), ...draftPicks],
        [draftPicks, patchPlayer],
    );

    // Per-team quick-pick sources (patch FC values onto roster players too)
    const giveRoster   = useMemo(
        () => (myTeam?.players ?? myRoster).map(patchPlayer),
        [myTeam, myRoster, patchPlayer],
    );
    const givePicks    = myTeam?.picks   ?? draftPicks;
    const selectedTeam = useMemo(
        () => otherTeams.find(t => t.rosterId === selectedTeamId) ?? null,
        [otherTeams, selectedTeamId]
    );
    const receiveRoster = useMemo(
        () => (selectedTeam?.players ?? (myTeam ? [] : myRoster)).map(patchPlayer),
        [selectedTeam, myTeam, myRoster, patchPlayer],
    );
    const receivePicks  = selectedTeam?.picks   ?? [];

    const result = useMemo(() => {
        if (sideA.length === 0 && sideB.length === 0) return null;
        return evaluateTrade(sideA, sideB, ppr, leagueType, [], [], leagueSettings);
    }, [sideA, sideB, ppr, leagueType, leagueSettings]);

    const positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'PICK'];

    const filteredPlayers = useMemo(() =>
        allPlayers.filter(p => posFilter === 'ALL' || p.position === posFilter),
        [allPlayers, posFilter]
    );

    return (
        <div className="space-y-6">
            {/* League badge */}
            {leagueLabel && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#C8A951]/10 border border-[#C8A951]/30 rounded-xl w-fit">
                    <span className="text-[#C8A951] text-xs font-semibold">⚙ Configured for:</span>
                    <span className="text-[#C8A951]/80 text-xs">{leagueLabel}</span>
                </div>
            )}

            {/* Settings row */}
            <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-400 text-sm font-medium">Format:</span>
                    {([
                        [0,         'Std'],
                        [0.5,       '½ PPR'],
                        [1,         'Full PPR'],
                        ['te_prem', 'TE Prem'],
                    ] as [PprFormat, string][]).map(([v, label]) => (
                        <button key={String(v)} onClick={() => setPpr(v)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${ppr === v ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                            {label}
                        </button>
                    ))}
                    <button onClick={() => setLeagueSettings(s => ({ ...s, sfSlots: s.sfSlots > 0 ? 0 : 1 }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${superflex ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                        SFLX
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm font-medium">Type:</span>
                    {(['Redraft', 'Dynasty'] as LeagueType[]).map(t => (
                        <button key={t} onClick={() => setLeagueType(t)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${leagueType === t ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm font-medium">League Size:</span>
                    {LEAGUE_SIZES.map(s => (
                        <button key={s} onClick={() => setLeagueSize(s)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${leagueSize === s ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Trade sides */}
            <div className="grid md:grid-cols-2 gap-4">
                {/* Side A */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-white">You Give</h2>
                        {result && <span className="text-2xl font-extrabold text-white">{result.totalA}</span>}
                    </div>
                    {(giveRoster.length > 0 || givePicks.length > 0) && (
                        <RosterQuickPick
                            players={giveRoster}
                            picks={givePicks}
                            excluded={allExcluded}
                            ppr={ppr}
                            leagueType={leagueType}
                            settings={leagueSettings}
                            onAdd={p => setSideA(prev => prev.length < 5 ? [...prev, p] : prev)}
                        />
                    )}
                    <PlayerSearch onAdd={p => setSideA(prev => prev.length < 5 ? [...prev, p] : prev)} excluded={allExcluded} ppr={ppr} leagueType={leagueType} settings={leagueSettings} players={allPlayers} />
                    <div className="space-y-2">
                        {result?.sideA.map(r => (
                            <PlayerPill key={r.name} result={r} leagueType={leagueType} onRemove={() => setSideA(prev => prev.filter(p => p.name !== r.name))} />
                        ))}
                        {sideA.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Search and add up to 5 players</p>}
                    </div>
                </div>

                {/* Side B */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-white">You Receive</h2>
                        {result && <span className="text-2xl font-extrabold text-white">{result.totalB}</span>}
                    </div>
                    {otherTeams.length > 0 && (
                        <div>
                            <label className="text-gray-500 text-xs font-medium block mb-1">Trading with</label>
                            <select
                                value={selectedTeamId ?? ''}
                                onChange={e => setSelectedTeamId(Number(e.target.value))}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C8A951]/60">
                                {otherTeams.map(t => (
                                    <option key={t.rosterId} value={t.rosterId}>{t.teamName}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {(receiveRoster.length > 0 || receivePicks.length > 0) && (
                        <RosterQuickPick
                            players={receiveRoster}
                            picks={receivePicks}
                            excluded={allExcluded}
                            ppr={ppr}
                            leagueType={leagueType}
                            settings={leagueSettings}
                            rosterLabel={selectedTeam ? `${selectedTeam.teamName.split(' ')[0]}'s Roster` : 'Roster'}
                            onAdd={p => setSideB(prev => prev.length < 5 ? [...prev, p] : prev)}
                        />
                    )}
                    <PlayerSearch onAdd={p => setSideB(prev => prev.length < 5 ? [...prev, p] : prev)} excluded={allExcluded} ppr={ppr} leagueType={leagueType} settings={leagueSettings} players={allPlayers} />
                    <div className="space-y-2">
                        {result?.sideB.map(r => (
                            <PlayerPill key={r.name} result={r} leagueType={leagueType} onRemove={() => setSideB(prev => prev.filter(p => p.name !== r.name))} />
                        ))}
                        {sideB.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Search and add up to 5 players</p>}
                    </div>
                </div>
            </div>

            {/* Verdict */}
            {result && (sideA.length > 0 || sideB.length > 0) && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
                    <h2 className="font-bold">Trade Verdict</h2>
                    <div className="grid sm:grid-cols-3 gap-4 text-center">
                        <div>
                            <p className="text-gray-500 text-xs mb-1">You Give</p>
                            <p className="text-3xl font-extrabold text-white">{result.totalA}</p>
                            <p className="text-gray-500 text-xs mt-1">DTV</p>
                        </div>
                        <div className="flex flex-col items-center justify-center gap-1">
                            <p className={`text-xl font-extrabold ${verdictColor(result.verdict)}`}>{result.verdict}</p>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-xs">Trade Score:</span>
                                <span className={`text-lg font-bold ${verdictColor(result.verdict)}`}>{result.score}</span>
                                <span className="text-gray-600 text-xs">/ 100</span>
                            </div>
                            <p className="text-gray-600 text-xs">
                                {result.winner === 'Even' ? 'Essentially even' :
                                 result.winner === 'A' ? `You overpay by ${result.diff}` :
                                 `You win by ${result.diff}`}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs mb-1">You Receive</p>
                            <p className="text-3xl font-extrabold text-white">{result.totalB}</p>
                            <p className="text-gray-500 text-xs mt-1">DTV</p>
                        </div>
                    </div>

                    {/* Bar comparison */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xs w-20 text-right shrink-0">You Give</span>
                            <div className="flex-1 bg-gray-800 rounded-full h-3">
                                <div className="bg-red-500 h-3 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, result.totalA / Math.max(result.totalA, result.totalB, 1) * 100)}%` }} />
                            </div>
                            <span className="text-white text-xs font-bold w-10">{result.totalA}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xs w-20 text-right shrink-0">You Get</span>
                            <div className="flex-1 bg-gray-800 rounded-full h-3">
                                <div className="bg-green-500 h-3 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, result.totalB / Math.max(result.totalA, result.totalB, 1) * 100)}%` }} />
                            </div>
                            <span className="text-white text-xs font-bold w-10">{result.totalB}</span>
                        </div>
                    </div>

                    {/* Score scale */}
                    <div className="text-xs text-gray-600 text-center">
                        0–14 Robbery · 15–29 Bad Deal · 30–44 Slight Loss · 45–59 Fair Trade · 60–74 Slight Edge · 75–89 Strong Win · 90–100 Slam Dunk
                    </div>
                </div>
            )}

            {/* Reference chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="font-bold">DTV Reference Chart</h2>
                        <p className="text-gray-500 text-xs mt-0.5">Values adjust for position scarcity, age curve ({leagueType}), and PPR format.</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {positions.map(pos => (
                            <button key={pos} onClick={() => setPosFilter(pos)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${posFilter === pos ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
                                {pos}
                            </button>
                        ))}
                    </div>
                </div>

                {posFilter === 'PICK' ? (
                    /* Pick grid view */
                    <div className="p-6 space-y-6">
                        {/* Year tabs */}
                        <div className="flex gap-2">
                            {PICK_YEARS.map(y => (
                                <button key={y} onClick={() => setPickYear(y)}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition border ${pickYear === y ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                                    {y}
                                </button>
                            ))}
                        </div>

                        {/* Rounds */}
                        {[1, 2, 3, 4, 5].map(round => {
                            const roundPicks = draftPicks.filter(p =>
                                p.team === String(pickYear) && p.name.startsWith(`${pickYear} ${round}.`)
                            );
                            return (
                                <div key={round}>
                                    <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                                        Round {round}
                                    </h3>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                                        {roundPicks.map(p => {
                                            const dtv = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
                                            const pickLabel = p.name.split(' ')[1]; // e.g. "1.03"
                                            return (
                                                <div key={p.name}
                                                    className="bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-center hover:border-indigo-500/50 transition cursor-default">
                                                    <p className="text-indigo-300 font-bold text-sm">{pickLabel}</p>
                                                    <p className={`font-extrabold text-base ${TIER_COLORS[dtv.tier]}`}>{dtv.finalDtv}</p>
                                                    <p className="text-gray-600 text-xs">{dtv.tier}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* Standard player table */
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-800">
                                    <th className="text-left px-4 py-3 text-gray-500 font-medium w-10">#</th>
                                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Player</th>
                                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Pos</th>
                                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Team</th>
                                    <th className="text-left px-3 py-3 text-gray-500 font-medium hidden sm:table-cell">Intel</th>
                                    <th className="text-right px-3 py-3 text-gray-500 font-medium">DTV</th>
                                    <th className="text-right px-3 py-3 text-gray-500 font-medium">Tier</th>
                                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Add</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50">
                                {filteredPlayers.map(p => {
                                    const dtv     = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
                                    const inTrade = allExcluded.includes(p.name);
                                    return (
                                        <tr key={p.name} className="hover:bg-gray-800/30 transition">
                                            <td className="px-4 py-3 text-gray-600 text-xs">{p.rank}</td>
                                            <td className="px-3 py-3 text-white font-medium">{p.name}</td>
                                            <td className="px-3 py-3">
                                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[p.position] ?? ''}`}>
                                                    {p.position}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-gray-400">{p.team}</td>
                                            <td className="px-3 py-3 hidden sm:table-cell">
                                                <div className="flex flex-wrap gap-1">
                                                    {dtv.insights?.map(i => <InsightBadge key={i} label={i} />)}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-right font-bold text-white">{dtv.finalDtv}</td>
                                            <td className={`px-3 py-3 text-right font-semibold text-xs ${TIER_COLORS[dtv.tier]}`}>{dtv.tier}</td>
                                            <td className="px-4 py-3 text-right">
                                                {inTrade ? (
                                                    <span className="text-gray-700 text-xs">✓</span>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => setSideA(prev => prev.length < 5 ? [...prev, p] : prev)}
                                                            title="Add to Give"
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-800/60 text-red-400 hover:bg-red-900/40 transition">
                                                            Give
                                                        </button>
                                                        <button
                                                            onClick={() => setSideB(prev => prev.length < 5 ? [...prev, p] : prev)}
                                                            title="Add to Receive"
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-green-800/60 text-green-400 hover:bg-green-900/40 transition">
                                                            Get
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
