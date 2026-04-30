import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getLeagueUsers, getNflState } from '@/lib/sleeper';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType, PprFormat } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';
import { calculateAge } from '@/lib/calculateAge';

export const maxDuration = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

const KTC_CAP = 9999;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / KTC_CAP) * 100)));
}

function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildLeagueSettings(
    rosterPositions: string[],
    scoringSettings: Record<string, number> | null,
): LeagueSettings {
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
        flexSlots,
        sfSlots,
    };
}

function computePowerScore(
    wins: number, losses: number, pf: number, rosterDtv: number,
    maxPf: number, maxDtv: number,
): number {
    if (wins === 0 && losses === 0) {
        return maxDtv > 0 ? Math.round((rosterDtv / maxDtv) * 100) : 0;
    }
    const winPct  = (wins + losses) > 0 ? wins / (wins + losses) : 0;
    const pfNorm  = maxPf  > 0 ? pf / maxPf   : 0;
    const dtvNorm = maxDtv > 0 ? rosterDtv / maxDtv : 0;
    return Math.round(winPct * 40 + pfNorm * 30 + dtvNorm * 30);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nflState = await getNflState();
    if (nflState.season_type === 'pre') {
        return Response.json({ skipped: true, reason: 'preseason' });
    }
    const week = nflState.week;

    // Load all in-season leagues, deduplicated by Sleeper leagueId
    const leagues = await prisma.league.findMany({
        where:  { status: 'in_season' },
        select: { leagueId: true, leagueType: true, scoringType: true, scoringSettings: true, rosterPositions: true, totalRosters: true },
    });
    const uniqueLeagues = [...new Map(leagues.map(l => [l.leagueId, l])).values()];

    if (!uniqueLeagues.length) {
        return Response.json({ ok: true, message: 'No in-season leagues', week });
    }

    // Load KTC + Sleeper player data once for all leagues
    const [ktcRows, sleeperPlayers] = await Promise.all([
        prisma.fantasyCalcValue.findMany({
            where: {
                position: { in: ['QB', 'RB', 'WR', 'TE'] },
                OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }],
            },
            select: {
                playerName: true, nameLower: true, position: true,
                dynastyValue: true, dynastyValueSf: true,
                redraftValue: true, redraftValueSf: true,
            },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true, position: { in: ['QB', 'RB', 'WR', 'TE'] } },
            select: { playerId: true, fullName: true, team: true, injuryStatus: true, birthDate: true, age: true },
        }),
    ]);

    // Build Sleeper lookup maps
    type SleeperInfo = { playerId: string; team: string | null; injuryStatus: string | null; birthDate: string | null; age: number | null };
    const sleeperExact      = new Map<string, SleeperInfo>();
    const sleeperNormalized = new Map<string, SleeperInfo>();
    for (const p of sleeperPlayers) {
        const val  = { playerId: p.playerId, team: p.team, injuryStatus: p.injuryStatus, birthDate: p.birthDate, age: p.age };
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        if (!sleeperExact.has(exact))      sleeperExact.set(exact, val);
        if (!sleeperNormalized.has(normd)) sleeperNormalized.set(normd, val);
    }

    // Build a DTV lookup keyed by playerId for fast per-roster scoring
    // (playerId → { u, baseValue fn })
    type KtcEntry = { playerName: string; position: string; u: UniversePlayer };
    const ktcByPlayerId = new Map<string, KtcEntry>();
    for (const r of ktcRows) {
        if (!SKILL_POSITIONS.has(r.position)) continue;
        const exact   = r.nameLower;
        const normd   = normalizeName(r.nameLower);
        const sl      = sleeperExact.get(exact) ?? sleeperNormalized.get(normd) ?? null;
        if (!sl) continue;
        const rawTeam = sl.team ?? null;
        const team    = (rawTeam && rawTeam !== 'FA') ? rawTeam : null;
        const age     = calculateAge(sl.birthDate) ?? sl.age ?? null;
        const u: UniversePlayer = {
            name: r.playerName, position: r.position, team, age,
            dynasty:        normalise(r.dynastyValue),
            dynastySf:      normalise(r.dynastyValueSf),
            redraft:        normalise(r.redraftValue),
            redraftSf:      normalise(r.redraftValueSf),
            trend:          null,
            injuryStatus:   sl.injuryStatus ?? null,
            birthDate:      sl.birthDate ?? null,
            playerImageUrl: null,
        };
        ktcByPlayerId.set(sl.playerId, { playerName: r.playerName, position: r.position, u });
    }

    let saved = 0;
    let errors = 0;

    for (const league of uniqueLeagues) {
        try {
            const [rosters, members] = await Promise.all([
                getLeagueRosters(league.leagueId),
                getLeagueUsers(league.leagueId),
            ]);

            const leagueType      = (league.leagueType as LeagueType) ?? 'Redraft';
            const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
            const leagueSettings  = buildLeagueSettings(league.rosterPositions as string[], scoringSettings);
            const ppr: PprFormat  = league.scoringType === 'ppr' ? 1 : league.scoringType === 'half_ppr' ? 0.5 : 0;
            const superflex       = leagueSettings.sfSlots > 0;
            const leagueSize      = league.totalRosters;

            const ownerName = new Map(members.map(m => [m.user_id, m.display_name ?? `Team ${m.user_id}`]));

            // Compute roster DTV for each team
            const rosterRows = rosters.map(r => {
                const playerIds = r.players ?? [];
                const rosterDtv = playerIds.reduce((sum, pid) => {
                    const entry = ktcByPlayerId.get(pid);
                    if (!entry) return sum;
                    const baseValue = computePlayerBaseValue(entry.u, entry.position, {
                        leagueType, superflex, ppr, leagueSize,
                        passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe,
                    });
                    const p: Player = {
                        rank: 0, name: entry.u.name, position: entry.position,
                        team: entry.u.team ?? 'FA', age: entry.u.age ?? 0,
                        baseValue, injuryStatus: entry.u.injuryStatus,
                    };
                    const dtv = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
                    return sum + dtv.finalDtv;
                }, 0);

                return {
                    rosterId:  r.roster_id,
                    ownerName: r.owner_id ? (ownerName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`,
                    wins:      r.settings?.wins    ?? 0,
                    losses:    r.settings?.losses  ?? 0,
                    pf:        Math.round(((r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100) * 10) / 10,
                    rosterDtv: Math.round(rosterDtv * 10) / 10,
                };
            });

            const maxPf  = Math.max(...rosterRows.map(r => r.pf),  1);
            const maxDtv = Math.max(...rosterRows.map(r => r.rosterDtv), 1);

            const data = rosterRows
                .map(r => ({ ...r, powerScore: computePowerScore(r.wins, r.losses, r.pf, r.rosterDtv, maxPf, maxDtv) }))
                .sort((a, b) => b.powerScore - a.powerScore || b.rosterDtv - a.rosterDtv)
                .map((r, i) => ({ rank: i + 1, ...r }));

            await prisma.powerRankingSnapshot.upsert({
                where:  { leagueId_week: { leagueId: league.leagueId, week } },
                update: { data },
                create: { leagueId: league.leagueId, week, data },
            });

            saved++;
        } catch {
            errors++;
        }
    }

    return Response.json({ ok: true, week, saved, errors });
}
