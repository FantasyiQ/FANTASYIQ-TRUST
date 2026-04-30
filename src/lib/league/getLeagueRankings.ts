import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getLeagueUsers } from '@/lib/sleeper';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType, PprFormat } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';
import { calculateAge } from '@/lib/calculateAge';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import { stripe, priceIdToTier } from '@/lib/stripe';
import type { SubscriptionTier } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlayerRankingRow = {
    rank:          number;
    name:          string;
    position:      string;
    team:          string | null;
    age:           number | null;
    finalDtv:      number;
    tier:          string;
    injuryStatus:  string | null;
    playerImageUrl: string | null;
};

export type TeamRankingRow = {
    rank:        number;
    rosterId:    number;
    teamName:    string;
    ownerName:   string;
    totalDtv:    number;
    playerCount: number;
    topPlayer:   { name: string; position: string; finalDtv: number } | null;
    tier:        'Elite' | 'Contender' | 'Competitive' | 'Rebuilding';
};

export type PowerRankingRow = {
    rank:       number;
    rosterId:   number;
    teamName:   string;
    ownerName:  string;
    wins:       number;
    losses:     number;
    pf:         number;
    rosterDtv:  number;
    powerScore: number;
};

export type LeagueRankingsData = {
    league: {
        id:          string;
        leagueName:  string;
        leagueType:  LeagueType;
        scoringType: string | null;
    };
    playerRankings: PlayerRankingRow[];
    teamRankings:   TeamRankingRow[];
    powerRankings:  PowerRankingRow[];
};

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
        if (pos === 'QB')                             qbSlots++;
        else if (pos === 'RB')                        rbSlots++;
        else if (pos === 'WR')                        wrSlots++;
        else if (pos === 'TE')                        teSlots++;
        else if (pos === 'FLEX' || pos === 'REC_FLEX') flexSlots++;
        else if (pos === 'SUPER_FLEX')                sfSlots++;
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

function rosterTier(rank: number, total: number): 'Elite' | 'Contender' | 'Competitive' | 'Rebuilding' {
    const pct = total > 1 ? (rank - 1) / total : 0;
    if (pct <= 0.20) return 'Elite';
    if (pct <= 0.50) return 'Contender';
    if (pct <= 0.80) return 'Competitive';
    return 'Rebuilding';
}

function computePowerScore(
    wins: number, losses: number, pf: number, rosterDtv: number,
    maxPf: number, maxDtv: number,
): number {
    const allZeroRecord = wins === 0 && losses === 0;
    if (allZeroRecord) {
        return maxDtv > 0 ? Math.round((rosterDtv / maxDtv) * 100) : 0;
    }
    const winPct  = (wins + losses) > 0 ? wins / (wins + losses) : 0;
    const pfNorm  = maxPf  > 0 ? pf / maxPf   : 0;
    const dtvNorm = maxDtv > 0 ? rosterDtv / maxDtv : 0;
    return Math.round(winPct * 40 + pfNorm * 30 + dtvNorm * 30);
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function getLeagueRankings(id: string): Promise<LeagueRankingsData> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: {
                id: true, userId: true, leagueId: true, leagueName: true,
                leagueType: true, scoringType: true, scoringSettings: true,
                rosterPositions: true, totalRosters: true,
            },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: {
                connectedLeagues: { select: { leagueName: true } },
                subscriptions: {
                    where:   { status: { in: ['active', 'trialing'] } },
                    orderBy: { createdAt: 'desc' },
                    select:  { id: true, type: true, tier: true, leagueName: true, stripeSubscriptionId: true },
                },
                leagues: { select: { id: true, leagueName: true } },
            },
        }),
    ]);

    if (!league || league.userId !== session.user.id) notFound();

    // ── Tier gate ─────────────────────────────────────────────────────────────
    const activePlayerSub = dbUser?.subscriptions.find(s => s.type === 'player') ?? null;
    let playerTier = activePlayerSub?.tier ?? 'FREE';
    if (activePlayerSub?.stripeSubscriptionId) {
        try {
            const stripeSub      = await stripe.subscriptions.retrieve(activePlayerSub.stripeSubscriptionId);
            const currentPriceId = stripeSub.items.data[0]?.price.id;
            const stripeTier     = currentPriceId ? priceIdToTier(currentPriceId) : null;
            if (stripeTier) {
                playerTier = stripeTier;
                if (stripeTier !== activePlayerSub.tier) {
                    prisma.subscription.update({
                        where: { id: activePlayerSub.id },
                        data:  { tier: stripeTier as unknown as SubscriptionTier },
                    }).catch(() => {});
                }
            }
        } catch { /* fall back to DB */ }
    }

    const commSub = await prisma.subscription.findFirst({
        where:   { type: 'commissioner', leagueName: { equals: league.leagueName, mode: 'insensitive' }, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
        select:  { tier: true },
    });

    const syncedNameToId  = new Map((dbUser?.leagues ?? []).map(l => [l.leagueName.toLowerCase().trim(), l.id]));
    const leagueConnected = (dbUser?.connectedLeagues ?? []).some(cl => {
        if (cl.leagueName.toLowerCase().trim() === league.leagueName.toLowerCase().trim()) return true;
        return syncedNameToId.get(cl.leagueName.toLowerCase().trim()) === league.id;
    });
    const effectiveTier = effectiveTierForLeague(playerTier, commSub?.tier ?? null, leagueConnected);
    if (tierLevel(effectiveTier) < 2) notFound();

    // ── League settings ───────────────────────────────────────────────────────
    const leagueType      = (league.leagueType as LeagueType) ?? 'Redraft';
    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
    const leagueSettings  = buildLeagueSettings(league.rosterPositions as string[], scoringSettings);
    const ppr: PprFormat  = league.scoringType === 'ppr' ? 1 : league.scoringType === 'half_ppr' ? 0.5 : 0;
    const superflex       = leagueSettings.sfSlots > 0;
    const leagueSize      = league.totalRosters;

    // ── Fetch data in parallel ────────────────────────────────────────────────
    const [rosters, members, ktcRows, sleeperPlayers] = await Promise.all([
        getLeagueRosters(league.leagueId),
        getLeagueUsers(league.leagueId),
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

    // ── Build Sleeper lookup ──────────────────────────────────────────────────
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

    // ── Build universe + DTV list ─────────────────────────────────────────────
    type UniverseEntry = { u: UniversePlayer; finalDtv: number; tier: string };
    const universeEntries: UniverseEntry[] = ktcRows
        .filter(r => SKILL_POSITIONS.has(r.position))
        .map(r => {
            const exact    = r.nameLower;
            const normd    = normalizeName(r.nameLower);
            const sl       = sleeperExact.get(exact) ?? sleeperNormalized.get(normd) ?? null;
            const rawTeam  = sl?.team ?? null;
            const team     = (rawTeam && rawTeam !== 'FA') ? rawTeam : null;
            const age      = calculateAge(sl?.birthDate) ?? sl?.age ?? null;
            const playerId = sl?.playerId ?? null;

            const u: UniversePlayer = {
                name:           r.playerName,
                position:       r.position,
                team,
                age,
                dynasty:        normalise(r.dynastyValue),
                dynastySf:      normalise(r.dynastyValueSf),
                redraft:        normalise(r.redraftValue),
                redraftSf:      normalise(r.redraftValueSf),
                trend:          null,
                injuryStatus:   sl?.injuryStatus ?? null,
                birthDate:      sl?.birthDate ?? null,
                playerImageUrl: playerId ? `https://sleepercdn.com/content/nfl/players/${playerId}.jpg` : null,
            };

            const baseValue = computePlayerBaseValue(u, r.position, {
                leagueType, superflex, ppr, leagueSize,
                passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe,
            });

            const p: Player = {
                rank: 0, name: u.name, position: u.position, team: u.team ?? 'FA',
                age: u.age ?? 0, baseValue, injuryStatus: u.injuryStatus,
            };
            const dtv = calcDtv(p, ppr, leagueType, undefined, leagueSettings);

            return { u, finalDtv: dtv.finalDtv, tier: dtv.tier };
        })
        .sort((a, b) => b.finalDtv - a.finalDtv || a.u.name.localeCompare(b.u.name));

    // ── Player rankings (top 150) ─────────────────────────────────────────────
    const playerRankings: PlayerRankingRow[] = universeEntries.slice(0, 150).map((e, i) => ({
        rank:          i + 1,
        name:          e.u.name,
        position:      e.u.position,
        team:          e.u.team,
        age:           e.u.age,
        finalDtv:      e.finalDtv,
        tier:          e.tier,
        injuryStatus:  e.u.injuryStatus,
        playerImageUrl: e.u.playerImageUrl,
    }));

    // ── Build DTV lookup by player name (lowercase) ───────────────────────────
    const dtvByName = new Map(universeEntries.map(e => [e.u.name.toLowerCase(), e]));

    // ── Build display names from Sleeper users ────────────────────────────────
    const ownerDisplayName = new Map(members.map(m => [m.user_id, m.display_name ?? `Team ${m.user_id}`]));

    // ── Team rankings ─────────────────────────────────────────────────────────
    type RosterDtvEntry = { roster: typeof rosters[number]; ownerName: string; totalDtv: number; topPlayer: { name: string; position: string; finalDtv: number } | null };
    const rosterDtvList: RosterDtvEntry[] = rosters.map(r => {
        const playerIds = r.players ?? [];
        const ownerName = r.owner_id ? (ownerDisplayName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`;

        // Build player list from Sleeper full_name lookup
        const scoredPlayers = playerIds
            .map(pid => {
                const sl = sleeperPlayers.find(p => p.playerId === pid);
                if (!sl) return null;
                const entry = dtvByName.get(sl.fullName.toLowerCase())
                    ?? dtvByName.get(normalizeName(sl.fullName));
                if (!entry) return null;
                return { name: entry.u.name, position: entry.u.position, finalDtv: entry.finalDtv };
            })
            .filter((p): p is { name: string; position: string; finalDtv: number } => p !== null)
            .sort((a, b) => b.finalDtv - a.finalDtv);

        const totalDtv  = Math.round(scoredPlayers.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
        const topPlayer = scoredPlayers[0] ?? null;

        return { roster: r, ownerName, totalDtv, topPlayer };
    }).sort((a, b) => b.totalDtv - a.totalDtv);

    const teamRankings: TeamRankingRow[] = rosterDtvList.map((e, i) => ({
        rank:        i + 1,
        rosterId:    e.roster.roster_id,
        teamName:    `Team ${e.roster.roster_id}`,
        ownerName:   e.ownerName,
        totalDtv:    e.totalDtv,
        playerCount: (e.roster.players ?? []).length,
        topPlayer:   e.topPlayer,
        tier:        rosterTier(i + 1, rosterDtvList.length),
    }));

    // ── Power rankings ────────────────────────────────────────────────────────
    const rosterDtvById = new Map(rosterDtvList.map(e => [e.roster.roster_id, e.totalDtv]));
    const rosterRows = rosters.map(r => ({
        rosterId:  r.roster_id,
        ownerName: r.owner_id ? (ownerDisplayName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`,
        wins:      r.settings?.wins    ?? 0,
        losses:    r.settings?.losses  ?? 0,
        pf:        (r.settings?.fpts   ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
        rosterDtv: rosterDtvById.get(r.roster_id) ?? 0,
    }));

    const maxPf  = Math.max(...rosterRows.map(r => r.pf), 1);
    const maxDtv = Math.max(...rosterRows.map(r => r.rosterDtv), 1);

    const powerRankings: PowerRankingRow[] = rosterRows
        .map(r => ({
            ...r,
            teamName:   `Team ${r.rosterId}`,
            powerScore: computePowerScore(r.wins, r.losses, r.pf, r.rosterDtv, maxPf, maxDtv),
        }))
        .sort((a, b) => b.powerScore - a.powerScore || b.rosterDtv - a.rosterDtv)
        .map((r, i) => ({ ...r, rank: i + 1 }));

    return {
        league: {
            id:          league.id,
            leagueName:  league.leagueName,
            leagueType,
            scoringType: league.scoringType ?? null,
        },
        playerRankings,
        teamRankings,
        powerRankings,
    };
}
