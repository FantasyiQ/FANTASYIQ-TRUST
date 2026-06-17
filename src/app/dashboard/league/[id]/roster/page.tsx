export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeague, getLeagueRosters, getLeagueUsers, getPlayers } from '@/lib/sleeper';
import { calculatePreciseAge } from '@/lib/calculateAge';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';

// ── Slot counting ─────────────────────────────────────────────────────────────

const STARTER_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX', 'REC_FLEX', 'SUPER_FLEX', 'IDP_FLEX', 'K', 'DL', 'LB', 'DB', 'DEF']);

function slotCounts(rosterPositions: string[]) {
    let starters = 0, bench = 0, ir = 0, taxi = 0;
    for (const pos of rosterPositions) {
        if (pos === 'BN')        bench++;
        else if (pos === 'IR')   ir++;
        else if (pos === 'TAXI') taxi++;
        else if (STARTER_POSITIONS.has(pos)) starters++;
    }
    return { starters, bench, ir, taxi };
}

// ── DTV helpers (mirrors roster-values route) ────────────────────────────────

const VALUE_CAP = 9999;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / VALUE_CAP) * 100)));
}

function normalizeName(name: string): string {
    return name.toLowerCase()
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildLeagueSettings(rosterPositions: string[], scoringSettings: Record<string, number> | null): LeagueSettings {
    const ss = scoringSettings ?? {};
    let qbSlots = 0, rbSlots = 0, wrSlots = 0, teSlots = 0, flexSlots = 0, sfSlots = 0;
    for (const pos of rosterPositions) {
        if (pos === 'QB')                              qbSlots++;
        else if (pos === 'RB')                         rbSlots++;
        else if (pos === 'WR')                         wrSlots++;
        else if (pos === 'TE')                         teSlots++;
        else if (pos === 'FLEX' || pos === 'REC_FLEX') flexSlots++;
        else if (pos === 'SUPER_FLEX')                 sfSlots++;
    }
    return {
        passTd:     ss.pass_td      ?? DEFAULT_LEAGUE_SETTINGS.passTd,
        bonusRecTe: ss.bonus_rec_te ?? DEFAULT_LEAGUE_SETTINGS.bonusRecTe,
        qbSlots:    qbSlots  || DEFAULT_LEAGUE_SETTINGS.qbSlots,
        rbSlots:    rbSlots  || DEFAULT_LEAGUE_SETTINGS.rbSlots,
        wrSlots:    wrSlots  || DEFAULT_LEAGUE_SETTINGS.wrSlots,
        teSlots:    teSlots  || DEFAULT_LEAGUE_SETTINGS.teSlots,
        flexSlots, sfSlots,
    };
}

function scoringTypeToPpr(s: string | null): 0 | 0.5 | 1 {
    if (s === 'ppr')      return 1;
    if (s === 'half_ppr') return 0.5;
    return 0;
}

// ── Position group order ──────────────────────────────────────────────────────

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

function posGroup(pos: string): number {
    return POS_ORDER[pos] ?? 99;
}

// ── Types ────────────────────────────────────────────────────────────────────

type SlotStatus = 'Starter' | 'Bench' | 'IR' | 'Taxi';

interface RosterRow {
    playerId:     string;
    name:         string;
    position:     string;
    team:         string | null;
    age:          number | null;
    dtv:          number;
    injuryStatus: string | null;
    status:       SlotStatus;
}

// ── Styling ───────────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
    QB:  'bg-red-900/40 text-red-300 border-red-800',
    RB:  'bg-green-900/40 text-green-300 border-green-800',
    WR:  'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:  'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    K:   'bg-purple-900/40 text-purple-300 border-purple-800',
    DEF: 'bg-gray-800 text-gray-300 border-gray-700',
};

const STATUS_STYLES: Record<SlotStatus, string> = {
    Starter: 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30',
    Bench:   'bg-gray-800 text-gray-400 border-gray-700',
    IR:      'bg-red-900/30 text-red-400 border-red-800/50',
    Taxi:    'bg-indigo-900/30 text-indigo-400 border-indigo-800/50',
};

const INJURY_COLORS: Record<string, string> = {
    IR:           'text-red-400',
    Out:          'text-red-400',
    Doubtful:     'text-orange-400',
    Questionable: 'text-yellow-400',
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function MyRosterPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            leagueId:        true,
            leagueName:      true,
            season:          true,
            leagueType:      true,
            scoringType:     true,
            scoringSettings: true,
            rosterPositions: true,
            totalRosters:    true,
            userId:          true,
            sleeperUserId:   true,
        },
    });
    if (!league) redirect('/dashboard');

    const dbUser = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { sleeperUserId: true },
    });
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;

    const leagueType      = (league.leagueType as LeagueType) ?? 'Redraft';
    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
    const rosterPositions = league.rosterPositions as string[];
    const leagueSettings  = buildLeagueSettings(rosterPositions, scoringSettings);
    const ppr             = scoringTypeToPpr(league.scoringType);
    const superflex       = leagueSettings.sfSlots > 0;
    const leagueSize      = league.totalRosters;
    const [rosters, members, sleeperLeague] = await Promise.all([
        getLeagueRosters(league.leagueId),
        getLeagueUsers(league.leagueId),
        getLeague(league.leagueId),
    ]);

    const baseSlots = slotCounts(rosterPositions);
    const slots = {
        starters: baseSlots.starters,
        bench:    baseSlots.bench,
        taxi:     sleeperLeague.settings?.taxi_slots    ?? baseSlots.taxi,
        ir:       sleeperLeague.settings?.reserve_slots ?? baseSlots.ir,
    };

    const myRoster = mySleeperUserId
        ? rosters.find(r => r.owner_id === mySleeperUserId)
        : null;

    if (!myRoster) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                <div className="text-4xl mb-3">🏈</div>
                <h2 className="text-lg font-bold mb-2">Roster Not Found</h2>
                <p className="text-gray-400 text-sm">
                    {mySleeperUserId
                        ? "Your Sleeper account wasn't matched to a roster in this league."
                        : 'Connect your Sleeper account to view your roster.'}
                </p>
            </div>
        );
    }

    const starterSet = new Set(myRoster.starters ?? []);
    const irSet      = new Set(myRoster.reserve  ?? []);
    const taxiSet    = new Set(myRoster.taxi      ?? []);
    const allPids    = myRoster.players ?? [];

    const [playerById, fcRows, sleeperPlayers] = await Promise.all([
        getPlayers(allPids),
        prisma.fantasyCalcValue.findMany({
            where:  { OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }] },
            select: { playerName: true, nameLower: true, position: true,
                      dynastyValue: true, dynastyValueSf: true,
                      redraftValue: true, redraftValueSf: true },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: allPids } },
            select: { playerId: true, fullName: true, injuryStatus: true, team: true, birthDate: true, age: true },
        }),
    ]);

    // Build name-based Sleeper lookup so ages feed into the DTV calc (matches roster-values route)
    type SleeperInfo = { team: string; injuryStatus: string | null; birthDate: string | null; age: number | null };
    const sleeperByExact = new Map<string, SleeperInfo>();
    const sleeperByNorm  = new Map<string, SleeperInfo>();
    const sleeperById    = new Map(sleeperPlayers.map(p => [p.playerId, p]));
    for (const p of sleeperPlayers) {
        const val   = { team: p.team, injuryStatus: p.injuryStatus, birthDate: p.birthDate, age: p.age };
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        if (!sleeperByExact.has(exact)) sleeperByExact.set(exact, val);
        if (!sleeperByNorm.has(normd))  sleeperByNorm.set(normd, val);
    }

    const dtvByName = new Map<string, number>();
    for (const r of fcRows) {
        const exact = r.nameLower;
        const normd = normalizeName(r.nameLower);
        const sl    = sleeperByExact.get(exact) ?? sleeperByNorm.get(normd) ?? null;
        const team  = (sl?.team && sl.team !== 'FA') ? sl.team : null;
        const age   = calculateAge(sl?.birthDate) ?? sl?.age ?? 0;

        const u: UniversePlayer = {
            name: r.playerName, position: r.position, team, age,
            dynasty: normalise(r.dynastyValue), dynastySf: normalise(r.dynastyValueSf),
            redraft: normalise(r.redraftValue), redraftSf: normalise(r.redraftValueSf),
            trend: null, injuryStatus: sl?.injuryStatus ?? null, birthDate: null, playerImageUrl: null,
        };
        const baseValue = SKILL_POSITIONS.has(r.position)
            ? computePlayerBaseValue(u, r.position, { leagueType, superflex, ppr, leagueSize, passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe })
            : 0;
        const ps: Player = {
            rank: 0, name: r.playerName, position: r.position,
            team: team ?? 'FA', age, baseValue,
            injuryStatus: sl?.injuryStatus,
        };
        const dtv = SKILL_POSITIONS.has(r.position)
            ? calcDtv(ps, ppr, leagueType, undefined, leagueSettings).finalDtv
            : 0;

        const existing = dtvByName.get(exact) ?? 0;
        if (dtv > existing) dtvByName.set(exact, dtv);
        const existingN = dtvByName.get(normd) ?? 0;
        if (dtv > existingN) dtvByName.set(normd, dtv);
    }

    // Build rows, sorted by position group then DTV descending
    const rows: RosterRow[] = allPids.map(pid => {
        const slim    = playerById[pid];
        const sl      = sleeperById.get(pid);
        const name    = slim?.full_name ?? `Player ${pid}`;
        const pos     = slim?.position  ?? '—';
        const team    = (slim?.team && slim.team !== 'FA') ? slim.team : null;
        const nameLow = name.toLowerCase();
        const normd   = normalizeName(name);
        const dtv     = dtvByName.get(nameLow) ?? dtvByName.get(normd) ?? 0;
        const inj     = sl?.injuryStatus ?? null;
        const age     = calculatePreciseAge(sl?.birthDate ?? null) ?? sl?.age ?? null;

        let status: SlotStatus;
        if (irSet.has(pid))           status = 'IR';
        else if (taxiSet.has(pid))    status = 'Taxi';
        else if (starterSet.has(pid)) status = 'Starter';
        else                          status = 'Bench';

        return { playerId: pid, name, position: pos, team, age, dtv, injuryStatus: inj, status };
    }).sort((a, b) => {
        const pg = posGroup(a.position) - posGroup(b.position);
        if (pg !== 0) return pg;
        return b.dtv - a.dtv;
    });

    const member      = members.find(m => m.user_id === mySleeperUserId);
    const displayName = member?.metadata?.team_name || member?.display_name || 'My Team';

    const starterCount = rows.filter(r => r.status === 'Starter').length;
    const benchCount   = rows.filter(r => r.status === 'Bench').length;
    const irCount      = rows.filter(r => r.status === 'IR').length;
    const taxiCount    = rows.filter(r => r.status === 'Taxi').length;
    const totalDtv     = Math.round(rows.reduce((s, r) => s + r.dtv, 0) * 10) / 10;

    const starterDtv = Math.round(rows.filter(r => r.status === 'Starter').reduce((s, r) => s + r.dtv, 0) * 10) / 10;
    const benchDtv   = Math.round(rows.filter(r => r.status === 'Bench').reduce((s, r) => s + r.dtv, 0) * 10) / 10;
    const taxiDtv    = Math.round(rows.filter(r => r.status === 'Taxi').reduce((s, r) => s + r.dtv, 0) * 10) / 10;
    const irDtv      = Math.round(rows.filter(r => r.status === 'IR').reduce((s, r) => s + r.dtv, 0) * 10) / 10;

    // Group rows by position for section headers
    const grouped: { pos: string; rows: RosterRow[] }[] = [];
    for (const row of rows) {
        const last = grouped[grouped.length - 1];
        if (last && last.pos === row.position) {
            last.rows.push(row);
        } else {
            grouped.push({ pos: row.position, rows: [row] });
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold">{displayName}</h1>
                <p className="text-gray-500 text-sm mt-0.5">{league.leagueName} · {league.season} Season</p>
            </div>

            {/* Slot summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                    { label: 'Starters', used: starterCount, total: slots.starters, color: 'text-[#D4AF37]' },
                    { label: 'Bench',    used: benchCount,   total: slots.bench,    color: 'text-gray-300'  },
                    { label: 'Taxi',     used: taxiCount,    total: slots.taxi,     color: 'text-indigo-400'},
                    { label: 'IR',       used: irCount,      total: slots.ir,       color: 'text-red-400'   },
                ].map(({ label, used, total, color }) => (
                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</p>
                        <p className={`text-2xl font-bold ${color}`}>{used}<span className="text-gray-600 text-lg font-normal">/{total}</span></p>
                        <p className="text-gray-600 text-xs mt-0.5">{total - used} open</p>
                    </div>
                ))}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Total DTV</p>
                    <p className="text-2xl font-bold text-white">{totalDtv}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{rows.length} players</p>
                </div>
            </div>

            {/* Player table grouped by position */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                        <thead>
                            <tr className="border-b border-gray-800">
                                <th scope="col" className="text-left px-5 py-3 text-gray-500 font-medium">Player</th>
                                <th scope="col" className="text-left px-3 py-3 text-gray-500 font-medium hidden sm:table-cell">Team</th>
                                <th scope="col" className="text-right px-3 py-3 text-gray-500 font-medium hidden sm:table-cell">Age</th>
                                <th scope="col" className="text-right px-3 py-3 text-gray-500 font-medium">DTV</th>
                                <th scope="col" className="text-right px-5 py-3 text-gray-500 font-medium">Slot</th>
                            </tr>
                        </thead>
                        <tbody>
                            {grouped.map(({ pos, rows: posRows }) => (
                                <>
                                    {/* Position section header */}
                                    <tr key={`hdr-${pos}`} className="border-t border-gray-800 bg-gray-800/30">
                                        <td colSpan={5} className="px-5 py-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[pos] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                                    {pos}
                                                </span>
                                                <span className="text-gray-500 text-xs">{posRows.length} player{posRows.length !== 1 ? 's' : ''}</span>
                                            </div>
                                        </td>
                                    </tr>
                                    {posRows.map(row => (
                                        <tr key={row.playerId} className="border-t border-gray-800/40 hover:bg-gray-800/20 transition">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-white font-medium">{row.name}</span>
                                                    {row.injuryStatus && row.injuryStatus !== 'Active' && (
                                                        <span className={`text-[10px] font-bold ${INJURY_COLORS[row.injuryStatus] ?? 'text-orange-400'}`}>
                                                            {row.injuryStatus.toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-gray-400 hidden sm:table-cell">
                                                {row.team ?? <span className="text-gray-700">FA</span>}
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-400 hidden sm:table-cell">
                                                {row.age ?? <span className="text-gray-700">—</span>}
                                            </td>
                                            <td className="px-3 py-3 text-right font-bold text-white">
                                                {row.dtv > 0 ? row.dtv : <span className="text-gray-600">—</span>}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${STATUS_STYLES[row.status]}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-5 py-10 text-center text-gray-600">No players on roster.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-600">
                    <span>DTV = Dynasty Trade Value scoped to this league</span>
                    <span>{rows.length} players · {totalDtv} total DTV</span>
                </div>
            </div>
        </div>
    );
}
