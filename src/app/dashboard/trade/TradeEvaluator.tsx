'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { getDraftPicks, evaluateTrade, calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, PprFormat, LeagueType, DtvResult, LeagueSettings } from '@/lib/trade-engine';
import type { UniversePlayer, UniverseResponse, UniverseMeta, DeltaEntry, DeltaResponse } from '@/lib/player-universe';
import { computePlayerBaseValue, playerVolatility } from '@/lib/player-universe';
import { calculateAge } from '@/lib/calculateAge';

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


function timeAgo(iso: string | null | undefined): string {
    if (!iso) return 'unknown';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1)  return 'just now';
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
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

function PlayerPill({ result, onRemove, leagueSize }: { result: DtvResult; onRemove: () => void; leagueType: LeagueType; leagueSize: number }) {
    const displayAge = result.birthDate ? calculateAge(result.birthDate) : result.age || null;
    const isPick = result.position === 'PICK';
    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Player headshot */}
                    {!isPick && result.playerImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={result.playerImageUrl}
                            alt={result.name}
                            className="h-10 w-10 rounded-full object-cover shrink-0 bg-gray-700"
                            onError={(e) => { e.currentTarget.src = '/images/player-placeholder.svg'; }}
                        />
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md border shrink-0 ${POS_COLORS[result.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                        {result.position}
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-white text-sm font-semibold truncate">
                                {isPick ? pickLabel(result.name, leagueSize) : result.name}
                            </p>
                            {result.injuryStatus && result.injuryStatus !== 'Active' && (
                                <span className={`text-[10px] font-bold px-1 py-0.5 rounded shrink-0 ${
                                    result.injuryStatus === 'IR'       ? 'bg-red-900/60 text-red-400' :
                                    result.injuryStatus === 'Out'      ? 'bg-red-900/40 text-red-400' :
                                    result.injuryStatus === 'PUP'      ? 'bg-red-900/40 text-red-300' :
                                    result.injuryStatus === 'Doubtful' ? 'bg-orange-900/60 text-orange-400' :
                                    'bg-yellow-900/40 text-yellow-400'
                                }`}>
                                    {result.injuryStatus === 'Questionable' ? 'Q' :
                                     result.injuryStatus === 'Doubtful'     ? 'D' :
                                     result.injuryStatus === 'Out'          ? 'O' :
                                     result.injuryStatus}
                                </span>
                            )}
                        </div>
                        <p className="text-gray-500 text-xs">
                            {isPick ? `${result.team} Draft` : `${result.team}${displayAge ? ` · Age ${displayAge}` : ''}`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                        <p className={`font-bold text-sm ${TIER_COLORS[result.tier]}`}>{result.finalDtv}</p>
                        <p className="text-gray-600 text-xs">{result.tier}</p>
                    </div>
                    <button onClick={onRemove} className="text-gray-700 hover:text-red-400 transition text-lg leading-none">×</button>
                </div>
            </div>

        </div>
    );
}

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

// Future picks (year > current draft year) show as "Early/Mid/Late Nth" — exact slot unknown until standings lock
function pickLabel(name: string, leagueSize: number): string {
    const m = name.match(/^(\d{4}) (\d+)\.(\d+)$/);
    if (!m) return name;
    const year  = parseInt(m[1]);
    if (year <= PICK_YEARS[0]) return name; // current year: draft order is known
    const round = parseInt(m[2]);
    const slot  = parseInt(m[3]);
    const third = Math.ceil(leagueSize / 3);
    const tier  = slot <= third ? 'Early' : slot <= third * 2 ? 'Mid' : 'Late';
    const ord   = ['1st','2nd','3rd','4th','5th'][round - 1] ?? `${round}th`;
    return `${year} ${tier} ${ord}`;
}

function RosterQuickPick({ players, picks = [], excluded, ppr, leagueType, leagueSize = 12, settings = DEFAULT_LEAGUE_SETTINGS, onAdd, rosterLabel = 'My Roster' }: {
    players:      Player[];
    picks?:       Player[];
    excluded:     string[];
    ppr:          PprFormat;
    leagueType:   LeagueType;
    leagueSize?:  number;
    settings?:    LeagueSettings;
    onAdd:        (p: Player) => void;
    rosterLabel?: string;
}) {
    const [tab, setTab]           = useState<'roster' | 'picks'>(players.length === 0 && picks.length > 0 ? 'picks' : 'roster');
    const [pickYear, setPickYear] = useState(PICK_YEARS[0]);

    const sorted = useMemo(() =>
        [...players].sort((a, b) => {
            const posDiff = (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9);
            if (posDiff !== 0) return posDiff;
            // Within each position: highest DTV first
            const aDtv = calcDtv(a, ppr, leagueType, undefined, settings).finalDtv;
            const bDtv = calcDtv(b, ppr, leagueType, undefined, settings).finalDtv;
            return bDtv - aDtv;
        }),
        [players, ppr, leagueType, settings]
    );

    // Extract round number from either "YYYY R.SS" or "YYYY Round N ..." format
    const pickRound = (name: string): number => {
        const exact = name.match(/^\d{4} (\d+)\./);
        if (exact) return parseInt(exact[1], 10);
        const tier = name.match(/^\d{4} Round (\d+)/i);
        if (tier) return parseInt(tier[1], 10);
        return 1;
    };
    // Sort order within a round: exact picks by slot, tier picks by Early→Mid→Late
    const pickSlotOrder = (name: string): number => {
        const slot = name.match(/\d+\.(\d+)/);
        if (slot) return parseInt(slot[1], 10);
        if (name.includes('Early')) return 1;
        if (name.includes('Mid'))   return 50;
        if (name.includes('Late'))  return 99;
        return 50;
    };

    const yearPicks = useMemo(() => {
        const result = picks
            .filter(p => p.team === String(pickYear))
            .sort((a, b) => {
                const ar = pickRound(a.name), br = pickRound(b.name);
                return ar !== br ? ar - br : pickSlotOrder(a.name) - pickSlotOrder(b.name);
            });
        return result;
    }, [picks, pickYear]);

    const rounds = useMemo(() => {
        const map = new Map<number, Player[]>();
        for (const p of yearPicks) {
            const round = pickRound(p.name);
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
                        {rounds.map(([round, roundPicks]) => {
                            const isFuture = pickYear > PICK_YEARS[0];
                            const ord = ['1st','2nd','3rd','4th','5th'][round - 1] ?? `${round}th`;
                            const third = Math.ceil(leagueSize / 3);
                            const tierOf = (slot: number) => slot <= third ? 'Early' : slot <= third * 2 ? 'Mid' : 'Late';
                            return (
                                <div key={round} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-gray-600 text-[10px] font-semibold w-8 shrink-0">Rd {round}</span>
                                    {isFuture
                                        ? roundPicks
                                            // Exact-slot picks (e.g. "2027 1.04") are hypothetical for future years;
                                            // only show tier picks ("2027 Round 1 Early 1st") which come from
                                            // buildPickOwnerMap. Exact picks only appear if draft_order is set early.
                                            .filter(p => !p.name.match(/^\d{4} \d+\./))
                                            .map((p, i) => {
                                            const used = excluded.includes(p.name);
                                            const dtv  = calcDtv(p, ppr, leagueType, undefined, settings);
                                            const slotM = p.name.match(/\d+\.(\d+)/);
                                            const tierLabel = slotM
                                                ? tierOf(parseInt(slotM[1]))
                                                : p.name.includes('Early') ? 'Early'
                                                : p.name.includes('Late')  ? 'Late' : 'Mid';
                                            return (
                                                <button key={`${p.name}-${i}`} type="button" disabled={used}
                                                    onClick={() => onAdd(p)}
                                                    title={`${p.name} — DTV ${dtv.finalDtv}`}
                                                    className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium transition ${
                                                        used
                                                            ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                                                            : 'border-indigo-800/60 text-indigo-300 hover:border-indigo-500 hover:text-white'
                                                    }`}>
                                                    {tierLabel} {ord}
                                                    <span className="text-gray-600">{dtv.finalDtv}</span>
                                                </button>
                                            );
                                        })
                                        : roundPicks.map(p => {
                                            const used = excluded.includes(p.name);
                                            const dtv  = calcDtv(p, ppr, leagueType, undefined, settings);
                                            return (
                                                <button key={p.name} type="button" disabled={used} onClick={() => onAdd(p)}
                                                    title={`${p.name} — DTV ${dtv.finalDtv}`}
                                                    className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium transition ${
                                                        used
                                                            ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                                                            : 'border-indigo-800/60 text-indigo-300 hover:border-indigo-500 hover:text-white'
                                                    }`}>
                                                    {p.name.split(' ')[1]}
                                                    <span className="text-gray-600">{dtv.finalDtv}</span>
                                                </button>
                                            );
                                        })
                                    }
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function PlayerSearch({ onAdd, excluded, ppr, leagueType, settings = DEFAULT_LEAGUE_SETTINGS, players, allPicks = [], leagueSize = 12 }: {
    onAdd: (p: Player) => void;
    excluded: string[];
    ppr: PprFormat;
    leagueType: LeagueType;
    settings?: LeagueSettings;
    players: Player[];
    allPicks?: Player[];
    leagueSize?: number;
}) {
    const [query, setQuery]     = useState('');
    const [results, setResults] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = useCallback(async (q: string) => {
        if (q.length < 2) { setResults([]); return; }
        setLoading(true);
        try {
            const ql = q.toLowerCase();
            // Match picks: raw name or label (e.g. "early first", "mid 2nd", "2027", "1.04")
            const pickMatches = allPicks
                .filter(p => {
                    const label = pickLabel(p.name, leagueSize).toLowerCase();
                    return (p.name.toLowerCase().includes(ql) || label.includes(ql)) && !excluded.includes(p.name);
                })
                .slice(0, 8);

            const res = await fetch(`/api/players/trade-search?q=${encodeURIComponent(q)}`);
            const playerData = await res.json() as Player[];
            const playerMatches = playerData.filter(p => !excluded.includes(p.name));

            // Picks first if query looks like a pick
            const looksLikePick = /\d\.\d|\b20\d{2}\b|\b(early|mid|late)\b/i.test(q) ||
                (pickMatches.length > 0 && playerMatches.length === 0);
            setResults(looksLikePick
                ? [...pickMatches, ...playerMatches].slice(0, 12)
                : [...playerMatches, ...pickMatches].slice(0, 12)
            );
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [excluded, allPicks]);

    function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
        const val = e.target.value;
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { void search(val); }, 250);
    }

    return (
        <div className="relative">
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={handleInput}
                    placeholder="Search any player or pick (e.g. 1.04, 2026)…"
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
                                                <span className="text-white text-sm truncate">
                                                    {p.position === 'PICK' ? pickLabel(p.name, leagueSize) : p.name}
                                                </span>
                                                <span className="text-gray-500 text-xs">
                                                    {p.position === 'PICK' ? `${p.team} Draft` : p.team}
                                                </span>
                                            </div>
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
    myPicks?:               Player[];       // user's owned picks from all synced leagues
    allLeaguePicks?:        Player[];       // all picks from all teams in all synced leagues
    hideQuickPick?:         boolean;        // suppress roster/pick quick-add panels (search-only mode)
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
    myPicks               = [],
    allLeaguePicks        = [],
    hideQuickPick         = false,
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
    const [sideC, setSideC]           = useState<Player[]>([]);
    const [threeWay, setThreeWay]     = useState(false);
    const [selectedTeamId, setSelectedTeamId]   = useState<number | null>(otherTeams[0]?.rosterId ?? null);
    const [selectedTeamCId, setSelectedTeamCId] = useState<number | null>(null);
    const [universe,     setUniverse]     = useState<UniversePlayer[]>([]);
    const [universeMeta, setUniverseMeta] = useState<UniverseMeta | null>(null);
    const [deltaEntries, setDeltaEntries] = useState<DeltaEntry[]>([]);
    const [deltaAge,     setDeltaAge]     = useState<string | null>(null);

    // Load universe + delta in parallel (both cached 5 min on CDN)
    useEffect(() => {
        Promise.all([
            fetch('/api/players/universe').then(r => r.json() as Promise<UniverseResponse>),
            fetch('/api/players/delta').then(r => r.json() as Promise<DeltaResponse>),
        ]).then(([uData, dData]) => {
            setUniverse(uData.players);
            setUniverseMeta(uData.meta);
            setDeltaEntries(dData.entries ?? []);
            setDeltaAge(dData.snapshotTakenAt);
        }).catch(() => {});
    }, []);

    // Universe keyed by lowercase name for fast lookup (roster player overlay)
    const universeMap = useMemo(
        () => new Map(universe.map(u => [u.name.toLowerCase(), u])),
        [universe],
    );

    // Overlay universe values onto an existing Player (used for roster players
    // whose names come from Sleeper and may already be Player-shaped objects).
    const patchPlayer = useCallback((p: Player): Player => {
        if (p.position === 'PICK') return p;
        const u = universeMap.get(p.name.toLowerCase());
        if (!u) return p;
        return {
            ...p,
            baseValue:       computePlayerBaseValue(u, p.position, { leagueType, superflex, ppr, leagueSize, passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe }),
            team:            u.team ?? p.team,
            age:             u.age ?? p.age,
            injuryStatus:    u.injuryStatus ?? p.injuryStatus ?? null,
            birthDate:       u.birthDate ?? p.birthDate ?? null,
            playerImageUrl:  u.playerImageUrl ?? p.playerImageUrl ?? null,
        };
    }, [universeMap, leagueType, superflex, ppr, leagueSize, leagueSettings]);

    const allExcluded = [...sideA.map(p => p.name), ...sideB.map(p => p.name), ...sideC.map(p => p.name)];

    const draftPicks = useMemo(() => getDraftPicks(leagueSize), [leagueSize]);
    const allPlayers = useMemo(() => {
        const players: Player[] = universe.map((u, i) => ({
            rank:            i + 1,
            name:            u.name,
            position:        u.position,
            team:            u.team ?? 'FA',
            age:             u.age ?? 0,
            baseValue:       computePlayerBaseValue(u, u.position, { leagueType, superflex, ppr, leagueSize, passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe }),
            injuryStatus:    u.injuryStatus,
            birthDate:       u.birthDate,
            playerImageUrl:  u.playerImageUrl,
        }));
        return [...players, ...draftPicks];
    }, [universe, draftPicks, leagueType, superflex, ppr, leagueSize, leagueSettings]);

    // All picks available for search: league-synced picks + full draft pick grid
    // Deduplicated: league picks first (have correct values), fill in missing slots from draftPicks
    const searchablePicks = useMemo(() => {
        const seen = new Set<string>();
        const picks: Player[] = [];
        for (const p of [...allLeaguePicks, ...draftPicks]) {
            if (!seen.has(p.name)) { seen.add(p.name); picks.push(p); }
        }
        return picks;
    }, [allLeaguePicks, draftPicks]);

    // Per-team quick-pick sources (patch FC values onto roster players too)
    const giveRoster   = useMemo(
        () => (myTeam?.players ?? myRoster).map(patchPlayer),
        [myTeam, myRoster, patchPlayer],
    );

    const givePicks    = myTeam?.picks ?? (myPicks.length > 0 ? myPicks : draftPicks);
    const selectedTeam = useMemo(
        () => otherTeams.find(t => t.rosterId === selectedTeamId) ?? null,
        [otherTeams, selectedTeamId]
    );
    const receiveRoster = useMemo(
        () => (selectedTeam?.players ?? (myTeam ? [] : myRoster)).map(patchPlayer),
        [selectedTeam, myTeam, myRoster, patchPlayer],
    );
    const receivePicks  = selectedTeam?.picks ?? (myTeam ? [] : draftPicks);

    // Team 3 — all teams are selectable (including the member's own team)
    const allTeamsForC = useMemo(
        () => [...(myTeam ? [myTeam] : []), ...otherTeams],
        [myTeam, otherTeams],
    );
    const selectedTeamC = useMemo(
        () => allTeamsForC.find(t => t.rosterId === selectedTeamCId) ?? null,
        [allTeamsForC, selectedTeamCId],
    );
    const teamCRoster = useMemo(
        () => (selectedTeamC?.players ?? []).map(patchPlayer),
        [selectedTeamC, patchPlayer],
    );
    const teamCPicks = selectedTeamC?.picks ?? [];

    const result = useMemo(() => {
        if (sideA.length === 0 && sideB.length === 0) return null;
        return evaluateTrade(sideA, sideB, ppr, leagueType, [], [], leagueSettings);
    }, [sideA, sideB, ppr, leagueType, leagueSettings]);

    const totalC = useMemo(() =>
        Math.round(sideC.reduce((s, p) => s + calcDtv(p, ppr, leagueType, undefined, leagueSettings).finalDtv, 0) * 10) / 10,
        [sideC, ppr, leagueType, leagueSettings]
    );

    const positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'MOVERS'];

    // Delta lookup keyed by lowercase player name
    const deltaMap = useMemo(
        () => new Map(deltaEntries.map(e => [e.name.toLowerCase(), e])),
        [deltaEntries],
    );

    // Asset momentum insight for the trade verdict
    const tradeInsight = useMemo(() => {
        if (!result || deltaEntries.length === 0) return null;
        const avgDelta = (players: Player[]) => {
            const vals = players
                .filter(p => p.position !== 'PICK')
                .map(p => deltaMap.get(p.name.toLowerCase())?.dynasty.delta ?? 0);
            return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        };
        const give = avgDelta(sideA);
        const recv = avgDelta(sideB);
        const diff = give - recv;
        if (Math.abs(diff) < 3) return null;
        if (diff > 0) {
            return { type: 'warn' as const,  text: `You're trading away rising assets (avg +${give.toFixed(1)}) for declining ones (avg ${recv.toFixed(1)}) — reconsider.` };
        }
        return { type: 'good' as const, text: `You're acquiring rising assets (avg +${recv.toFixed(1)}) from declining ones (avg ${give.toFixed(1)}) — good timing.` };
    }, [result, sideA, sideB, deltaMap, deltaEntries]);

    // Rank map: computed across ALL players sorted by finalDtv, so ranks are
    // stable and consistent regardless of which position filter is active.
    const dtvRankMap = useMemo(() => {
        const sorted = [...allPlayers].sort((a, b) => {
            const diff = calcDtv(b, ppr, leagueType, undefined, leagueSettings).finalDtv
                       - calcDtv(a, ppr, leagueType, undefined, leagueSettings).finalDtv;
            return diff !== 0 ? diff : a.name.localeCompare(b.name);
        });
        const map = new Map<string, number>();
        sorted.forEach((p, i) => map.set(p.name, i + 1));
        return map;
    }, [allPlayers, ppr, leagueType, leagueSettings]);

    const filteredPlayers = useMemo(() =>
        allPlayers
            .filter(p => posFilter === 'ALL' || p.position === posFilter)
            .sort((a, b) => {
                const diff = calcDtv(b, ppr, leagueType, undefined, leagueSettings).finalDtv
                           - calcDtv(a, ppr, leagueType, undefined, leagueSettings).finalDtv;
                return diff !== 0 ? diff : a.name.localeCompare(b.name);
            }),
        [allPlayers, posFilter, ppr, leagueType, leagueSettings]
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

            {/* 3-way toggle */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => { setThreeWay(v => !v); if (threeWay) setSideC([]); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition border ${threeWay ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                    {threeWay ? '✕ Remove 3rd Team' : '+ 3-Way Trade'}
                </button>
            </div>

            {/* Trade sides */}
            <div className={`grid gap-4 ${threeWay ? 'lg:grid-cols-3 md:grid-cols-2' : 'md:grid-cols-2'}`}>
                {/* Team 1 */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-white">Team 1</h2>
                        {result && <span className="text-2xl font-extrabold text-white">{result.totalA}</span>}
                    </div>
                    {myTeam && (
                        <div>
                            <label className="text-gray-500 text-xs font-medium block mb-1">Your team</label>
                            <div className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white">
                                {myTeam.teamName}
                            </div>
                        </div>
                    )}
                    {(giveRoster.length > 0 || givePicks.length > 0) && (
                        <RosterQuickPick
                            players={giveRoster}
                            picks={givePicks}
                            excluded={allExcluded}
                            ppr={ppr}
                            leagueType={leagueType}
                            leagueSize={leagueSize}
                            settings={leagueSettings}
                            onAdd={p => setSideA(prev => prev.length < 5 ? [...prev, p] : prev)}
                        />
                    )}
                    <PlayerSearch onAdd={p => setSideA(prev => prev.length < 5 ? [...prev, p] : prev)} excluded={allExcluded} ppr={ppr} leagueType={leagueType} settings={leagueSettings} players={allPlayers} allPicks={searchablePicks} leagueSize={leagueSize} />
                    <div className="space-y-2">
                        {result?.sideA.map(r => (
                            <PlayerPill key={r.name} result={r} leagueType={leagueType} leagueSize={leagueSize} onRemove={() => setSideA(prev => prev.filter(p => p.name !== r.name))} />
                        ))}
                        {sideA.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Search and add up to 5 players</p>}
                    </div>
                </div>

                {/* Team 2 */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-white">Team 2</h2>
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
                            leagueSize={leagueSize}
                            settings={leagueSettings}
                            rosterLabel={selectedTeam ? `${selectedTeam.teamName.split(' ')[0]}'s Roster` : 'Roster'}
                            onAdd={p => setSideB(prev => prev.length < 5 ? [...prev, p] : prev)}
                        />
                    )}
                    <PlayerSearch onAdd={p => setSideB(prev => prev.length < 5 ? [...prev, p] : prev)} excluded={allExcluded} ppr={ppr} leagueType={leagueType} settings={leagueSettings} players={allPlayers} allPicks={searchablePicks} leagueSize={leagueSize} />
                    <div className="space-y-2">
                        {result?.sideB.map(r => (
                            <PlayerPill key={r.name} result={r} leagueType={leagueType} leagueSize={leagueSize} onRemove={() => setSideB(prev => prev.filter(p => p.name !== r.name))} />
                        ))}
                        {sideB.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Search and add up to 5 players</p>}
                    </div>
                </div>

                {/* Team 3 (3-way) */}
                {threeWay && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-white">Team 3</h2>
                            {sideC.length > 0 && <span className="text-2xl font-extrabold text-white">{totalC}</span>}
                        </div>
                        {allTeamsForC.length > 0 && (
                            <div>
                                <label className="text-gray-500 text-xs font-medium block mb-1">Trading with</label>
                                <select
                                    value={selectedTeamCId ?? ''}
                                    onChange={e => setSelectedTeamCId(Number(e.target.value))}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C8A951]/60">
                                    <option value="">Select a team</option>
                                    {allTeamsForC.map(t => (
                                        <option key={t.rosterId} value={t.rosterId}>{t.teamName}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {(teamCRoster.length > 0 || teamCPicks.length > 0) && (
                            <RosterQuickPick
                                players={teamCRoster}
                                picks={teamCPicks}
                                excluded={allExcluded}
                                ppr={ppr}
                                leagueType={leagueType}
                                leagueSize={leagueSize}
                                settings={leagueSettings}
                                rosterLabel={selectedTeamC ? `${selectedTeamC.teamName.split(' ')[0]}'s Roster` : 'Roster'}
                                onAdd={p => setSideC(prev => prev.length < 5 ? [...prev, p] : prev)}
                            />
                        )}
                        <PlayerSearch onAdd={p => setSideC(prev => prev.length < 5 ? [...prev, p] : prev)} excluded={allExcluded} ppr={ppr} leagueType={leagueType} settings={leagueSettings} players={allPlayers} allPicks={searchablePicks} leagueSize={leagueSize} />
                        <div className="space-y-2">
                            {sideC.map(p => {
                                const r = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
                                return <PlayerPill key={p.name} result={r} leagueType={leagueType} leagueSize={leagueSize} onRemove={() => setSideC(prev => prev.filter(x => x.name !== p.name))} />;
                            })}
                            {sideC.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Search and add up to 5 players</p>}
                        </div>
                    </div>
                )}
            </div>

            {/* Verdict */}
            {result && (sideA.length > 0 || sideB.length > 0) && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
                    <h2 className="font-bold">Trade Verdict</h2>

                    {threeWay ? (
                        /* 3-way: show all 3 totals + bar */
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4 text-center">
                                {([['Team 1', result.totalA], ['Team 2', result.totalB], ['Team 3', totalC]] as [string, number][]).map(([label, total]) => {
                                    const maxTotal = Math.max(result.totalA, result.totalB, totalC, 1);
                                    const isWinner = total === maxTotal;
                                    return (
                                        <div key={label}>
                                            <p className="text-gray-500 text-xs mb-1">{label}</p>
                                            <p className={`text-3xl font-extrabold ${isWinner ? 'text-[#C8A951]' : 'text-white'}`}>{total}</p>
                                            <p className="text-gray-500 text-xs mt-1">DTV{isWinner ? ' 🏆' : ''}</p>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="space-y-2">
                                {([['Team 1', result.totalA, 'bg-blue-500'], ['Team 2', result.totalB, 'bg-green-500'], ['Team 3', totalC, 'bg-purple-500']] as [string, number, string][]).map(([label, total, color]) => (
                                    <div key={label} className="flex items-center gap-3">
                                        <span className="text-gray-500 text-xs w-14 text-right shrink-0">{label}</span>
                                        <div className="flex-1 bg-gray-800 rounded-full h-3">
                                            <div className={`${color} h-3 rounded-full transition-all`}
                                                style={{ width: `${Math.min(100, total / Math.max(result.totalA, result.totalB, totalC, 1) * 100)}%` }} />
                                        </div>
                                        <span className="text-white text-xs font-bold w-10">{total}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* 2-way: existing verdict */
                        <>
                            <div className="grid sm:grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-gray-500 text-xs mb-1">Team 1</p>
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
                                         result.winner === 'A' ? `Team 1 wins by ${result.diff}` :
                                         `Team 1 overpays by ${result.diff}`}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-gray-500 text-xs mb-1">Team 2</p>
                                    <p className="text-3xl font-extrabold text-white">{result.totalB}</p>
                                    <p className="text-gray-500 text-xs mt-1">DTV</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-500 text-xs w-14 text-right shrink-0">Team 1</span>
                                    <div className="flex-1 bg-gray-800 rounded-full h-3">
                                        <div className="bg-blue-500 h-3 rounded-full transition-all"
                                            style={{ width: `${Math.min(100, result.totalA / Math.max(result.totalA, result.totalB, 1) * 100)}%` }} />
                                    </div>
                                    <span className="text-white text-xs font-bold w-10">{result.totalA}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-500 text-xs w-14 text-right shrink-0">Team 2</span>
                                    <div className="flex-1 bg-gray-800 rounded-full h-3">
                                        <div className="bg-green-500 h-3 rounded-full transition-all"
                                            style={{ width: `${Math.min(100, result.totalB / Math.max(result.totalA, result.totalB, 1) * 100)}%` }} />
                                    </div>
                                    <span className="text-white text-xs font-bold w-10">{result.totalB}</span>
                                </div>
                            </div>
                            <div className="text-xs text-gray-600 text-center">
                                0–14 Robbery · 15–29 Bad Deal · 30–44 Slight Loss · 45–55 Fair Trade · 56–74 Slight Edge · 75–89 Strong Win · 90–100 Slam Dunk
                            </div>
                            {tradeInsight && (
                                <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-sm ${
                                    tradeInsight.type === 'warn'
                                        ? 'bg-orange-950/30 border-orange-800/50 text-orange-300'
                                        : 'bg-green-950/30 border-green-800/50 text-green-300'
                                }`}>
                                    <span className="text-base shrink-0">{tradeInsight.type === 'warn' ? '⚠️' : '📈'}</span>
                                    <span>{tradeInsight.text}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Reference chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="font-bold">Player Rankings</h2>
                        <p className="text-gray-500 text-xs mt-0.5">
                            Values adjust for position scarcity, age curve ({leagueType}), and PPR format.
                            {universeMeta?.ktcSyncedAt && (
                                <span className="ml-2 text-gray-600">· KTC synced {timeAgo(universeMeta.ktcSyncedAt)}</span>
                            )}
                        </p>
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
                            const isFutureChart = pickYear > PICK_YEARS[0];
                            const ord = ['1st','2nd','3rd','4th','5th'][round - 1] ?? `${round}th`;
                            const roundPicks = draftPicks.filter(p => {
                                if (p.team !== String(pickYear)) return false;
                                if (isFutureChart) {
                                    // Future years: tier picks only ("2027 Round 1 Early 1st")
                                    const tierMatch = p.name.match(/^(\d{4}) Round (\d+) /);
                                    return !!tierMatch && parseInt(tierMatch[2]) === round;
                                }
                                // Current year: exact-slot picks only ("2026 1.04")
                                return p.name.startsWith(`${pickYear} ${round}.`);
                            }).sort((a, b) => {
                                const as_ = parseInt(a.name.split('.')[1] ?? '0');
                                const bs_ = parseInt(b.name.split('.')[1] ?? '0');
                                return as_ - bs_;
                            });
                            if (roundPicks.length === 0) return null;
                            const third = Math.ceil(leagueSize / 3);
                            const tierOf = (slot: number) => slot <= third ? 'Early' : slot <= third * 2 ? 'Mid' : 'Late';
                            return (
                                <div key={round}>
                                    <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Round {round}</h3>
                                    {isFutureChart ? (
                                        <div className="grid grid-cols-3 gap-3">
                                            {(['Early','Mid','Late'] as const).map(tierName => {
                                                const tierPicks = roundPicks.filter(p => {
                                                    if (p.name.includes(tierName)) return true;
                                                    const slotMatch = p.name.match(/\d+\.(\d+)/);
                                                    return slotMatch ? tierOf(parseInt(slotMatch[1])) === tierName : false;
                                                });
                                                if (tierPicks.length === 0) return null;
                                                const avgDtv = Math.round(tierPicks.reduce((s, p) => s + calcDtv(p, ppr, leagueType, undefined, leagueSettings).finalDtv, 0) / tierPicks.length * 10) / 10;
                                                const repDtv = calcDtv(tierPicks[Math.floor(tierPicks.length / 2)], ppr, leagueType, undefined, leagueSettings);
                                                return (
                                                    <div key={tierName} className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-center hover:border-indigo-500/50 transition cursor-default">
                                                        <p className="text-indigo-300 font-bold text-sm">{tierName} {ord}</p>
                                                        <p className={`font-extrabold text-base ${TIER_COLORS[repDtv.tier]}`}>{avgDtv}</p>
                                                        <p className="text-gray-600 text-xs">{repDtv.tier}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                                            {roundPicks.map(p => {
                                                const dtv = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
                                                const slot = p.name.split(' ')[1];
                                                return (
                                                    <div key={p.name} className="bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-center hover:border-indigo-500/50 transition cursor-default">
                                                        <p className="text-indigo-300 font-bold text-sm">{slot}</p>
                                                        <p className={`font-extrabold text-base ${TIER_COLORS[dtv.tier]}`}>{dtv.finalDtv}</p>
                                                        <p className="text-gray-600 text-xs">{dtv.tier}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : posFilter === 'MOVERS' ? (
                    /* Market Movers view */
                    <div className="p-6 space-y-6">
                        {deltaEntries.length === 0 ? (
                            <div className="text-center py-10 text-gray-600">
                                <p className="text-2xl mb-2">📊</p>
                                <p className="text-sm font-medium text-gray-500">No delta data yet</p>
                                <p className="text-xs text-gray-600 mt-1">Available after the next daily KTC sync (runs at 7 AM UTC)</p>
                            </div>
                        ) : (
                            <>
                                {deltaAge && (
                                    <p className="text-gray-600 text-xs">Compared to snapshot from {timeAgo(deltaAge)}</p>
                                )}
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Risers */}
                                    <div>
                                        <h3 className="text-green-400 font-bold text-sm mb-3 flex items-center gap-1.5">📈 Risers <span className="text-gray-600 font-normal">(dynasty)</span></h3>
                                        <div className="space-y-1.5">
                                            {[...deltaEntries].filter(e => !e.isNew && !e.isDropped && e.dynasty.delta > 0)
                                                .sort((a, b) => b.dynasty.delta - a.dynasty.delta)
                                                .slice(0, 20)
                                                .map(e => (
                                                    <div key={e.name} className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg hover:bg-gray-800 transition">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className={`text-[10px] font-bold px-1 py-0.5 rounded border shrink-0 ${POS_COLORS[e.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>{e.position}</span>
                                                            <span className="text-white text-sm font-medium truncate">{e.name}</span>
                                                        </div>
                                                        <span className="text-green-400 font-bold text-sm shrink-0">+{e.dynasty.delta}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                    {/* Fallers */}
                                    <div>
                                        <h3 className="text-red-400 font-bold text-sm mb-3 flex items-center gap-1.5">📉 Fallers <span className="text-gray-600 font-normal">(dynasty)</span></h3>
                                        <div className="space-y-1.5">
                                            {[...deltaEntries].filter(e => !e.isNew && !e.isDropped && e.dynasty.delta < 0)
                                                .sort((a, b) => a.dynasty.delta - b.dynasty.delta)
                                                .slice(0, 20)
                                                .map(e => (
                                                    <div key={e.name} className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg hover:bg-gray-800 transition">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className={`text-[10px] font-bold px-1 py-0.5 rounded border shrink-0 ${POS_COLORS[e.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>{e.position}</span>
                                                            <span className="text-white text-sm font-medium truncate">{e.name}</span>
                                                        </div>
                                                        <span className="text-red-400 font-bold text-sm shrink-0">{e.dynasty.delta}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                    {/* New players */}
                                    {deltaEntries.some(e => e.isNew) && (
                                        <div>
                                            <h3 className="text-[#C8A951] font-bold text-sm mb-3">✨ New to Universe</h3>
                                            <div className="space-y-1.5">
                                                {deltaEntries.filter(e => e.isNew).map(e => (
                                                    <div key={e.name} className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className={`text-[10px] font-bold px-1 py-0.5 rounded border shrink-0 ${POS_COLORS[e.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>{e.position}</span>
                                                            <span className="text-white text-sm font-medium truncate">{e.name}</span>
                                                        </div>
                                                        <span className="text-[#C8A951] font-bold text-xs">NEW</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {/* Dropped players */}
                                    {deltaEntries.some(e => e.isDropped) && (
                                        <div>
                                            <h3 className="text-gray-500 font-bold text-sm mb-3">🗑 Dropped from Universe</h3>
                                            <div className="space-y-1.5">
                                                {deltaEntries.filter(e => e.isDropped).map(e => (
                                                    <div key={e.name} className="flex items-center justify-between px-3 py-2 bg-gray-800/30 rounded-lg opacity-60">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-[10px] font-bold px-1 py-0.5 rounded border bg-gray-800 text-gray-500 border-gray-700 shrink-0">{e.position}</span>
                                                            <span className="text-gray-400 text-sm truncate">{e.name}</span>
                                                        </div>
                                                        <span className="text-gray-600 font-bold text-xs">DROPPED</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
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
                                    <th className="text-right px-3 py-3 text-gray-500 font-medium">DTV</th>
                                    <th className="text-right px-3 py-3 text-gray-500 font-medium">Tier</th>
                                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Add</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50">
                                {filteredPlayers.map(p => {
                                    const dtv      = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
                                    const inTrade  = allExcluded.includes(p.name);
                                    const de       = deltaMap.get(p.name.toLowerCase());
                                    const vol      = playerVolatility(de);
                                    const dDelta   = de?.dynasty.delta;
                                    return (
                                        <tr key={p.name} className="hover:bg-gray-800/30 transition">
                                            <td className="px-4 py-3 text-gray-600 text-xs">{dtvRankMap.get(p.name) ?? p.rank}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-white font-medium">{p.name}</span>
                                                    {vol === 'volatile' && <span className="text-[9px] font-bold px-1 py-px rounded bg-orange-900/40 text-orange-400 border border-orange-800/50 shrink-0">HOT</span>}
                                                    {de?.isNew && <span className="text-[9px] font-bold px-1 py-px rounded bg-[#C8A951]/10 text-[#C8A951] border border-[#C8A951]/30 shrink-0">NEW</span>}
                                                    {de?.team && <span className="text-[9px] font-bold px-1 py-px rounded bg-blue-900/30 text-blue-400 border border-blue-800/40 shrink-0" title={`Traded: ${de.team.prev ?? 'FA'} → ${de.team.current ?? 'FA'}`}>TRADED</span>}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[p.position] ?? ''}`}>
                                                    {p.position}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-gray-400">{p.team}</td>
                                            <td className="px-3 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <span className="font-bold text-white">{dtv.finalDtv}</span>
                                                    {dDelta !== undefined && dDelta !== 0 && (
                                                        <span className={`text-[10px] font-bold ${dDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {dDelta > 0 ? `+${dDelta}` : dDelta}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className={`px-3 py-3 text-right font-semibold text-xs ${TIER_COLORS[dtv.tier]}`}>{dtv.tier}</td>
                                            <td className="px-4 py-3 text-right">
                                                {inTrade ? (
                                                    <span className="text-gray-700 text-xs">✓</span>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => setSideA(prev => prev.length < 5 ? [...prev, p] : prev)}
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-800/60 text-blue-400 hover:bg-blue-900/40 transition">
                                                            T1
                                                        </button>
                                                        <button
                                                            onClick={() => setSideB(prev => prev.length < 5 ? [...prev, p] : prev)}
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-green-800/60 text-green-400 hover:bg-green-900/40 transition">
                                                            T2
                                                        </button>
                                                        {threeWay && (
                                                            <button
                                                                onClick={() => setSideC(prev => prev.length < 5 ? [...prev, p] : prev)}
                                                                className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-purple-800/60 text-purple-400 hover:bg-purple-900/40 transition">
                                                                T3
                                                            </button>
                                                        )}
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
