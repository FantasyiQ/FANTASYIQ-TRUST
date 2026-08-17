import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizePlayerName as normalizeName } from '@/lib/playerName';
import { getLeagueRosters, getLeagueUsers, getLeague, getNflState, getPlayers } from '@/lib/sleeper';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType, PprFormat } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';
import {
    computeRealPoints, computePerfFactor, toStatsPerGame,
    computePositionScoringFactor, combineScoringFactors, STANDARD_SCORING,
} from '@/lib/rankings/leagueScoringPoints';
import { calculateAge, calculatePreciseAge, isPlausiblyActivePlayer } from '@/lib/calculateAge';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import { stripe, priceIdToTier } from '@/lib/stripe';
import type { SubscriptionTier } from '@prisma/client';
import { buildLeagueConfig } from '@/lib/rankings/leagueConfigBuilder';
import { buildLeagueDefensiveAndKickerRankings } from '@/lib/rankings/defensiveEngine';
import { buildIdpSeedProjections, buildKickerSeedProjections, buildDefenseSeedProjections, toIdpPosition } from '@/lib/rankings/seedProjections';
import { buildProjectionsFromSleeperStats } from '@/lib/rankings/sleeperStatsAdapter';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlayerRankingRow = {
    rank:          number;
    name:          string;
    position:      string;
    team:          string | null;
    age:           number | null;
    /** Precise decimal age (e.g. 24.8) — the fraction is how far through that
     *  year of life the player is, used to show "Early"/"Late" alongside the
     *  whole-year age. Does not feed the DTV calc — that uses whole-year `age`. */
    preciseAge:    number | null;
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
    pa:         number;
    powerScore: number;
};

export type LeagueRankingsData = {
    league: {
        id:          string;
        leagueName:  string;
        leagueType:  LeagueType;
        scoringType: string | null;
    };
    playerRankings:     PlayerRankingRow[];
    teamRankings:       TeamRankingRow[];
    powerRankings:      PowerRankingRow[];
    valueSyncedAt:      string | null;
    lastSeasonRankings: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALUE_CAP = 9999;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

// Real IDP roster slot types across Sleeper leagues — matches the set already
// established in contextLoader.ts / draft/strategy page.tsx this session.
const IDP_SLOTS = new Set(['DL','DE','DT','NT','LB','OLB','ILB','MLB','DB','CB','S','FS','SS','NB','IDP','IDPFLEX','IDP_FLEX']);
// Real individual defensive positions a rostered IDP athlete can hold —
// distinct from IDP_SLOTS (roster slot types) since a roster slot like
// IDP_FLEX doesn't correspond to any player's own position.
const IDP_PLAYER_POSITIONS = new Set(['DL','DE','DT','NT','EDGE','LB','OLB','ILB','MLB','DB','CB','S','FS','SS','NB','SAF']);

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / VALUE_CAP) * 100)));
}

// Mirrors trade-engine.ts's own (unexported) tier() thresholds so K/DEF/IDP
// entries — scored by the defensive engine, not calcDtv — land in the same
// tier labels as everything else on the same 0-100 finalDtv scale.
function tierForValue(finalDtv: number): string {
    if (finalDtv >= 85) return 'Elite';
    if (finalDtv >= 70) return 'Star';
    if (finalDtv >= 55) return 'Starter';
    if (finalDtv >= 40) return 'Flex';
    if (finalDtv >= 25) return 'Bench';
    return 'Waiver';
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
        rushAtt:    ss.rush_att     ?? DEFAULT_LEAGUE_SETTINGS.rushAtt,
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
    wins: number, losses: number, pf: number, pa: number,
    maxPf: number, maxPa: number,
): number {
    if (wins === 0 && losses === 0 && pf === 0) return 50;
    const pfNorm  = maxPf > 0 ? pf / maxPf : 0;
    const winPct  = (wins + losses) > 0 ? wins / (wins + losses) : 0;
    if (maxPa === 0) {
        return Math.round(pfNorm * 62.5 + winPct * 37.5);
    }
    const sosNorm = pa / maxPa;
    return Math.round(pfNorm * 50 + winPct * 30 + sosNorm * 20);
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
                rosterPositions: true, totalRosters: true, platform: true, standings: true,
                assignedPlanId:   true,
                assignedPlanType: true,
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

    // ── Tier gate (same for all platforms) ───────────────────────────────────
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

    const isLeagueAssigned =
        playerTier === 'PLAYER_ELITE' ||
        (!!activePlayerSub && league.assignedPlanId === activePlayerSub.id) ||
        league.assignedPlanType === 'commissioner';
    const effectiveTier = effectiveTierForLeague(playerTier, commSub?.tier ?? null, isLeagueAssigned);
    if (tierLevel(effectiveTier) < 2) notFound();

    // ── League settings ───────────────────────────────────────────────────────
    const leagueType      = (league.leagueType as LeagueType) ?? 'Redraft';
    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
    const rosterPositions = league.rosterPositions as string[];
    const leagueSettings  = buildLeagueSettings(rosterPositions, scoringSettings);
    const ppr: PprFormat  = league.scoringType === 'ppr' ? 1 : league.scoringType === 'half_ppr' ? 0.5 : 0;
    const superflex       = leagueSettings.sfSlots > 0;
    const leagueSize      = league.totalRosters;

    // K/DEF/IDP are only relevant — and only shown — when this specific
    // league actually rosters them. A league with no DEF slot has no real
    // use for a defense's value, so showing one would be noise, not signal.
    const hasK           = rosterPositions.includes('K');
    const hasDef         = rosterPositions.includes('DEF');
    const hasIdp         = rosterPositions.some(p => IDP_SLOTS.has(p));
    const RANKED_POSITIONS = new Set([
        ...SKILL_POSITIONS,
        ...(hasK ? ['K'] : []),
        ...(hasDef ? ['DEF'] : []),
        ...(hasIdp ? [...IDP_PLAYER_POSITIONS] : []),
    ]);

    // ── Fetch shared DB data (no Sleeper API yet) ─────────────────────────────
    const nflState     = await getNflState();
    const statsSeason  = nflState.season;

    const [fcRows, sleeperPlayers, latestSync, currentSeasonStats] = await Promise.all([
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
            select: { playerId: true, fullName: true, team: true, injuryStatus: true, birthDate: true, age: true, position: true },
        }),
        prisma.fantasyCalcValue.findFirst({
            orderBy: { updatedAt: 'desc' },
            select:  { updatedAt: true },
        }),
        prisma.playerSeasonStats.findMany({
            where:  { season: statsSeason },
            select: { playerId: true, gamesPlayed: true, rawStats: true },
        }),
    ]);

    // League Scoring Points Engine: real per-league scoring adjustment. Fall back
    // to the prior completed season when the current season has no stats yet
    // (off-season / early weeks with few games played) so positional averages
    // aren't computed from an empty or near-empty sample.
    const seasonStatsRows = currentSeasonStats.length > 0
        ? currentSeasonStats
        : await prisma.playerSeasonStats.findMany({
            where:  { season: String(Number(statsSeason) - 1) },
            select: { playerId: true, gamesPlayed: true, rawStats: true },
        });
    const statsByPlayerId = new Map(
        seasonStatsRows.map(s => [s.playerId, {
            gamesPlayed:  s.gamesPlayed,
            statsPerGame: toStatsPerGame(s.rawStats as Record<string, number>, s.gamesPlayed),
        }])
    );

    // ── Build Sleeper player lookup (name+position → metadata) ────────────────
    // Some real players share an exact fullName (e.g. two "Justin Jefferson"s —
    // WR/MIN and LB/CLE). Resolve by name+position first (exact, then normalized
    // name); only fall back to a bare name match when that name is unambiguous,
    // so we never silently attach one player's team/age/id onto a different row.
    type SleeperInfo = { playerId: string; team: string | null; injuryStatus: string | null; birthDate: string | null; age: number | null };
    const byNamePos     = new Map<string, SleeperInfo>();
    const byNormNamePos = new Map<string, SleeperInfo>();
    const byNameCount     = new Map<string, number>();
    const byName          = new Map<string, SleeperInfo>();
    const byNormNameCount = new Map<string, number>();
    const byNormName      = new Map<string, SleeperInfo>();
    for (const p of sleeperPlayers) {
        const val: SleeperInfo = { playerId: p.playerId, team: p.team, injuryStatus: p.injuryStatus, birthDate: p.birthDate, age: p.age };
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        byNamePos.set(`${exact}|${p.position}`, val);
        byNormNamePos.set(`${normd}|${p.position}`, val);
        byNameCount.set(exact, (byNameCount.get(exact) ?? 0) + 1);
        byName.set(exact, val);
        byNormNameCount.set(normd, (byNormNameCount.get(normd) ?? 0) + 1);
        byNormName.set(normd, val);
    }
    function resolveSleeper(nameLower: string, position: string): SleeperInfo | undefined {
        const normd = normalizeName(nameLower);
        return byNamePos.get(`${nameLower}|${position}`)
            ?? byNormNamePos.get(`${normd}|${position}`)
            ?? (byNameCount.get(nameLower) === 1 ? byName.get(nameLower) : undefined)
            ?? (byNormNameCount.get(normd) === 1 ? byNormName.get(normd) : undefined);
    }

    // ── Build player universe + DTV ───────────────────────────────────────────
    type UniverseEntry = { u: UniversePlayer; finalDtv: number; tier: string };
    const universeEntries: UniverseEntry[] = [];
    const dtvByPlayerId  = new Map<string, UniverseEntry>(); // Sleeper player ID → entry
    const dtvByExactName = new Map<string, UniverseEntry>(); // lowercase name → entry (ESPN name matching)
    const dtvByNormName  = new Map<string, UniverseEntry>(); // normalized name → entry (ESPN name matching)

    // Pass 1: resolve each player's real per-game production under this league's
    // scoring settings, and accumulate positional totals — perfFactor can't be
    // computed until every player in a position group has been seen.
    type Pending = {
        r: (typeof fcRows)[number];
        team: string | null; age: number | null; playerId: string | null;
        injuryStatus: string | null; birthDate: string | null;
        statsPerGame: Record<string, number> | null; gamesPlayed: number | null;
        realPtsPerGame: number; standardPtsPerGame: number;
    };
    const pending: Pending[] = [];
    const posPtsSum      = new Map<string, number>();
    const posPtsCount    = new Map<string, number>();
    const posStdPtsSum   = new Map<string, number>(); // same players, scored under STANDARD_SCORING

    for (const r of fcRows) {
        if (!SKILL_POSITIONS.has(r.position)) continue;
        const sl       = resolveSleeper(r.nameLower, r.position) ?? null;
        const rawTeam  = sl?.team ?? null;
        const team     = (rawTeam && rawTeam !== 'FA') ? rawTeam : null;
        const age      = calculateAge(sl?.birthDate) ?? sl?.age ?? null;
        const playerId = sl?.playerId ?? null;

        const stats             = playerId ? statsByPlayerId.get(playerId) : undefined;
        const statsPerGame       = stats?.statsPerGame ?? null;
        const gamesPlayed        = stats?.gamesPlayed ?? null;
        const realPtsPerGame     = statsPerGame ? computeRealPoints(statsPerGame, scoringSettings) : 0;
        const standardPtsPerGame = statsPerGame ? computeRealPoints(statsPerGame, STANDARD_SCORING) : 0;

        if (statsPerGame && gamesPlayed) {
            posPtsSum.set(r.position, (posPtsSum.get(r.position) ?? 0) + realPtsPerGame);
            posPtsCount.set(r.position, (posPtsCount.get(r.position) ?? 0) + 1);
            posStdPtsSum.set(r.position, (posStdPtsSum.get(r.position) ?? 0) + standardPtsPerGame);
        }

        pending.push({
            r, team, age, playerId,
            injuryStatus: sl?.injuryStatus ?? null, birthDate: sl?.birthDate ?? null,
            statsPerGame, gamesPlayed, realPtsPerGame, standardPtsPerGame,
        });
    }

    const posAvgPtsPerGame    = new Map<string, number>();
    const posStdAvgPtsPerGame = new Map<string, number>();
    for (const [pos, sum] of posPtsSum) {
        posAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
    }
    for (const [pos, sum] of posStdPtsSum) {
        posStdAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
    }
    // Cross-positional shift: how this league's real scoring moves each whole
    // position relative to a generic PPR baseline — applies to every player at
    // the position uniformly, unlike perfFactor which varies per player.
    const posScoringFactor = new Map<string, number>();
    for (const pos of posAvgPtsPerGame.keys()) {
        posScoringFactor.set(pos, computePositionScoringFactor(
            posAvgPtsPerGame.get(pos) ?? 0,
            posStdAvgPtsPerGame.get(pos) ?? 0,
        ));
    }

    // Pass 2: now that positional averages are known, compute perfFactor and
    // build the final universe entry for each player.
    for (const { r, team, age, playerId, injuryStatus, birthDate, statsPerGame, gamesPlayed, realPtsPerGame } of pending) {
        const individualFactor = statsPerGame && gamesPlayed
            ? computePerfFactor(realPtsPerGame, posAvgPtsPerGame.get(r.position) ?? 0, gamesPlayed)
            : 1.0;
        const positionFactor = posScoringFactor.get(r.position) ?? 1.0;
        const perfFactor     = combineScoringFactors(individualFactor, positionFactor);

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
            injuryStatus,
            birthDate,
            playerImageUrl: playerId ? `https://sleepercdn.com/content/nfl/players/${playerId}.jpg` : null,
            statsPerGame,
            gamesPlayed,
        };

        const baseValue = computePlayerBaseValue(u, r.position, {
            leagueType, superflex, ppr, leagueSize,
            passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe, rushAtt: leagueSettings.rushAtt,
        });

        const p: Player = {
            rank: 0, name: u.name, position: u.position, team: u.team ?? 'FA',
            age: u.age ?? 0, baseValue, injuryStatus: u.injuryStatus, perfFactor,
        };
        const dtv   = calcDtv(p, ppr, leagueType, undefined, leagueSettings);
        const entry: UniverseEntry = { u, finalDtv: dtv.finalDtv, tier: dtv.tier };

        universeEntries.push(entry);
        if (playerId) dtvByPlayerId.set(playerId, entry);
        // Index by name for ESPN (name-based matching) — prefer higher value so stale
        // de-punctuated duplicates (e.g. "dj moore" value 0) never shadow the real entry.
        const exact = r.nameLower;
        const normd = normalizeName(r.nameLower);
        const existingExact = dtvByExactName.get(exact);
        const existingNormd = dtvByNormName.get(normd);
        if (!existingExact || dtv.finalDtv > existingExact.finalDtv) dtvByExactName.set(exact, entry);
        if (!existingNormd || dtv.finalDtv > existingNormd.finalDtv) dtvByNormName.set(normd, entry);
    }

    // ── K/DEF/IDP — only computed when this league actually rosters them ─────
    // Reuses the same defensive ranking engine already proven in the Trade
    // Evaluator (real per-league scoring, positional scarcity from actual
    // roster slot counts, ceilings that keep K/DEF/IDP from ever crowding out
    // a legitimate skill player — verified there this session: K max 45,
    // DEF max 55, IDP 60-70, all on this same 0-100 finalDtv scale).
    if (hasK || hasDef || hasIdp) {
        const allPlayersRaw = await getPlayers();
        const { scoring, lineup } = buildLeagueConfig(scoringSettings, rosterPositions, leagueSize);

        // Sleeper's free feed leaves long-retired players marked active with
        // stale data (see feedback_stale_sleeper_player_data) — team!=FA plus
        // a real-age cutoff catches most of it, and a depth-chart+experience
        // check catches the rarer case where team AND birthDate are both
        // stale (confirmed real for IDP-eligible positions too — e.g. Eric
        // Weddle, Jadeveon Clowney, Malcolm Jenkins all still pass team!=FA
        // + age<=45 despite having been out of the league for years).
        const allPlayers: typeof allPlayersRaw = {};
        for (const [pid, player] of Object.entries(allPlayersRaw)) {
            const age = calculateAge(player.birthDate) ?? player.age ?? null;
            if (!isPlausiblyActivePlayer({ team: player.team, age, depthChartOrder: player.depthChartOrder, yearsExp: player.yearsExp })) continue;
            allPlayers[pid] = player;
        }

        const idpPlayers: { playerId: string; position: 'DL' | 'LB' | 'DB' }[] = [];
        const kickerIds: string[] = [];
        for (const [pid, player] of Object.entries(allPlayers)) {
            if (hasIdp) {
                const idpPos = toIdpPosition(player.position);
                if (idpPos) idpPlayers.push({ playerId: pid, position: idpPos });
            }
            if (hasK && player.position === 'K') kickerIds.push(pid);
        }

        // Live stats-based projections need a season with real completed
        // games — try the current season first, fall back to the prior
        // completed one during the preseason window when this year's stats
        // don't exist yet (same fallback pattern used for PlayerSeasonStats
        // elsewhere in this file).
        const liveProjections = await buildProjectionsFromSleeperStats(statsSeason, allPlayers, scoringSettings)
            ?? await buildProjectionsFromSleeperStats(String(Number(statsSeason) - 1), allPlayers, scoringSettings);
        const idpProjections     = liveProjections?.idpProjections     ?? buildIdpSeedProjections(idpPlayers);
        const kickerProjections  = liveProjections?.kickerProjections  ?? buildKickerSeedProjections(kickerIds);
        const defenseProjections = liveProjections?.defenseProjections ?? buildDefenseSeedProjections();

        const rankings = buildLeagueDefensiveAndKickerRankings(
            scoring, lineup, idpProjections, kickerProjections, defenseProjections,
            leagueType, liveProjections?.offensiveTop5Avg ?? {},
        );

        const defensiveEntities = [
            ...(hasIdp ? rankings.idp       : []),
            ...(hasK   ? rankings.kickers   : []),
            ...(hasDef ? rankings.defenses  : []),
        ];

        if (defensiveEntities.length > 0) {
            const entityIds = defensiveEntities.map(e => e.id);
            const entityPlayers = await prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: entityIds } },
                select: { playerId: true, fullName: true, position: true, team: true, age: true, birthDate: true, injuryStatus: true },
            });
            const entityById = new Map(entityPlayers.map(p => [p.playerId, p]));

            for (const entity of defensiveEntities) {
                const sp = entityById.get(entity.id);
                if (!sp?.fullName) continue; // no real player/team match — skip rather than guess

                const finalDtv = entity.valueScore;
                const u: UniversePlayer = {
                    name:           sp.fullName,
                    position:       sp.position ?? entity.position,
                    team:           (sp.team && sp.team !== 'FA') ? sp.team : null,
                    age:            calculateAge(sp.birthDate) ?? sp.age,
                    dynasty: 0, dynastySf: 0, redraft: 0, redraftSf: 0, // not FantasyCalc-covered — value comes entirely from the defensive engine
                    trend:          null,
                    injuryStatus:   sp.injuryStatus,
                    birthDate:      sp.birthDate,
                    playerImageUrl: `https://sleepercdn.com/content/nfl/players/${entity.id}.jpg`,
                    statsPerGame:   null,
                    gamesPlayed:    null,
                };
                const entry: UniverseEntry = { u, finalDtv, tier: tierForValue(finalDtv) };

                universeEntries.push(entry);
                dtvByPlayerId.set(entity.id, entry);
                const exact = sp.fullName.toLowerCase();
                const normd = normalizeName(sp.fullName);
                const existingExact = dtvByExactName.get(exact);
                const existingNormd = dtvByNormName.get(normd);
                if (!existingExact || finalDtv > existingExact.finalDtv) dtvByExactName.set(exact, entry);
                if (!existingNormd || finalDtv > existingNormd.finalDtv) dtvByNormName.set(normd, entry);
            }
        }
    }

    universeEntries.sort((a, b) => b.finalDtv - a.finalDtv || a.u.name.localeCompare(b.u.name));

    // ── Player rankings (same for all platforms — full universe) ──────────────
    const playerRankings: PlayerRankingRow[] = universeEntries.map((e, i) => ({
        rank:           i + 1,
        name:           e.u.name,
        position:       e.u.position,
        team:           e.u.team,
        age:            e.u.age,
        preciseAge:     calculatePreciseAge(e.u.birthDate),
        finalDtv:       e.finalDtv,
        tier:           e.tier,
        injuryStatus:   e.u.injuryStatus,
        playerImageUrl: e.u.playerImageUrl,
    }));

    const leagueResult = {
        id:          league.id,
        leagueName:  league.leagueName,
        leagueType,
        scoringType: league.scoringType ?? null,
    };

    // ── ESPN branch: use stored standings — no Sleeper API calls ──────────────
    if (league.platform === 'espn') {
        type EspnPlayer = { name: string; position: string };
        type EspnTeam = {
            teamId: number; name: string;
            wins: number; losses: number; ties: number; fpts: number;
            players?: EspnPlayer[];
        };
        const espnTeams = (league.standings as EspnTeam[] | null) ?? [];

        const rosterDtvList = espnTeams.map(team => {
            const skillPlayers = (team.players ?? []).filter(p => RANKED_POSITIONS.has(p.position));
            const scoredPlayers = skillPlayers
                .map(p => {
                    const entry = dtvByExactName.get(p.name.toLowerCase()) ?? dtvByNormName.get(normalizeName(p.name));
                    if (!entry) return null;
                    return { name: entry.u.name, position: entry.u.position, finalDtv: entry.finalDtv };
                })
                .filter((p): p is { name: string; position: string; finalDtv: number } => p !== null)
                .sort((a, b) => b.finalDtv - a.finalDtv);

            const totalDtv  = Math.round(scoredPlayers.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
            const topPlayer = scoredPlayers[0] ?? null;
            return { team, totalDtv, topPlayer, playerCount: skillPlayers.length };
        }).sort((a, b) => b.totalDtv - a.totalDtv);

        const teamRankings: TeamRankingRow[] = rosterDtvList.map((e, i) => ({
            rank:        i + 1,
            rosterId:    e.team.teamId,
            teamName:    e.team.name,
            ownerName:   e.team.name,
            totalDtv:    e.totalDtv,
            playerCount: e.playerCount,
            topPlayer:   e.topPlayer,
            tier:        rosterTier(i + 1, rosterDtvList.length),
        }));

        const rosterDtvById = new Map(rosterDtvList.map(e => [e.team.teamId, e.totalDtv]));
        const maxPf  = Math.max(...espnTeams.map(t => t.fpts), 1);
        const maxDtv = Math.max(...rosterDtvList.map(e => e.totalDtv), 1);

        const powerRankings: PowerRankingRow[] = espnTeams
            .map(team => ({
                rosterId:   team.teamId,
                teamName:   team.name,
                ownerName:  team.name,
                wins:       team.wins,
                losses:     team.losses,
                pf:         team.fpts,
                pa:         0,
                powerScore: computePowerScore(team.wins, team.losses, team.fpts, 0, maxPf, 0),
            }))
            .sort((a, b) => b.powerScore - a.powerScore || b.pf - a.pf)
            .map((r, i) => ({ ...r, rank: i + 1 }));

        return { league: leagueResult, playerRankings, teamRankings, powerRankings, valueSyncedAt: latestSync?.updatedAt.toISOString() ?? null, lastSeasonRankings: false };
    }

    // ── Sleeper branch: fetch live rosters + members ──────────────────────────
    const [rosters, members] = await Promise.all([
        getLeagueRosters(league.leagueId),
        getLeagueUsers(league.leagueId),
    ]);

    // ── Build display names from Sleeper users ────────────────────────────────
    const ownerDisplayName = new Map(members.map(m => [m.user_id, m.display_name ?? `Team ${m.user_id}`]));

    // ── Team rankings ─────────────────────────────────────────────────────────
    type RosterDtvEntry = { roster: typeof rosters[number]; ownerName: string; totalDtv: number; topPlayer: { name: string; position: string; finalDtv: number } | null };
    const rosterDtvList: RosterDtvEntry[] = rosters.map(r => {
        const playerIds = r.players ?? [];
        const ownerName = r.owner_id ? (ownerDisplayName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`;

        const scoredPlayers = playerIds
            .map(pid => {
                const entry = dtvByPlayerId.get(pid);
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
    const rosterRows = rosters.map(r => ({
        rosterId:  r.roster_id,
        ownerName: r.owner_id ? (ownerDisplayName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`,
        wins:   r.settings?.wins   ?? 0,
        losses: r.settings?.losses ?? 0,
        pf: (r.settings?.fpts         ?? 0) + (r.settings?.fpts_decimal         ?? 0) / 100,
        pa: (r.settings?.fpts_against ?? 0) + (r.settings?.fpts_against_decimal ?? 0) / 100,
    }));

    const maxPf = Math.max(...rosterRows.map(r => r.pf), 1);
    const maxPa = Math.max(...rosterRows.map(r => r.pa), 0);

    // Pre-season: show last season's final power rankings instead of all-zero current data
    if (nflState.season_type === 'pre' || nflState.season_type === 'off') {
        const sleeperLeague = await getLeague(league.leagueId);
        const prevId = sleeperLeague.previous_league_id ?? null;

        // 1. Try DB snapshots (current league first, then previous league)
        let lastSnapshot = await prisma.powerRankingSnapshot.findFirst({
            where:   { leagueId: league.leagueId, week: { gt: 0 } },
            orderBy: { week: 'desc' },
            select:  { data: true },
        });
        if (!lastSnapshot && prevId) {
            lastSnapshot = await prisma.powerRankingSnapshot.findFirst({
                where:   { leagueId: prevId, week: { gt: 0 } },
                orderBy: { week: 'desc' },
                select:  { data: true },
            });
        }
        if (lastSnapshot?.data) {
            type SnapshotRow = { rank: number; rosterId: number; ownerName: string; wins: number; losses: number; pf: number; pa: number; powerScore: number };
            const snapshotRankings: PowerRankingRow[] = (lastSnapshot.data as SnapshotRow[]).map(r => ({
                rank:       r.rank,
                rosterId:   r.rosterId,
                teamName:   `Team ${r.rosterId}`,
                ownerName:  r.ownerName,
                wins:       r.wins       ?? 0,
                losses:     r.losses     ?? 0,
                pf:         r.pf         ?? 0,
                pa:         r.pa         ?? 0,
                powerScore: r.powerScore ?? 50,
            }));
            return { league: leagueResult, playerRankings, teamRankings, powerRankings: snapshotRankings, valueSyncedAt: latestSync?.updatedAt.toISOString() ?? null, lastSeasonRankings: true };
        }

        // 2. No snapshot — fetch previous league's rosters directly from Sleeper API
        if (prevId) {
            const [prevRosters, prevMembers] = await Promise.all([
                getLeagueRosters(prevId),
                getLeagueUsers(prevId),
            ]);
            const prevOwnerName = new Map(prevMembers.map(m => [m.user_id, m.display_name ?? `Team ${m.user_id}`]));
            const prevRows = prevRosters.map(r => ({
                rosterId:  r.roster_id,
                ownerName: r.owner_id ? (prevOwnerName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`,
                wins:   r.settings?.wins   ?? 0,
                losses: r.settings?.losses ?? 0,
                pf: (r.settings?.fpts         ?? 0) + (r.settings?.fpts_decimal         ?? 0) / 100,
                pa: (r.settings?.fpts_against ?? 0) + (r.settings?.fpts_against_decimal ?? 0) / 100,
            }));
            const prevMaxPf = Math.max(...prevRows.map(r => r.pf), 1);
            const prevMaxPa = Math.max(...prevRows.map(r => r.pa), 0);
            const prevRankings: PowerRankingRow[] = prevRows
                .map(r => ({ ...r, teamName: `Team ${r.rosterId}`, powerScore: computePowerScore(r.wins, r.losses, r.pf, r.pa, prevMaxPf, prevMaxPa) }))
                .sort((a, b) => b.powerScore - a.powerScore || b.pf - a.pf)
                .map((r, i) => ({ ...r, rank: i + 1 }));
            return { league: leagueResult, playerRankings, teamRankings, powerRankings: prevRankings, valueSyncedAt: latestSync?.updatedAt.toISOString() ?? null, lastSeasonRankings: true };
        }
    }

    const powerRankings: PowerRankingRow[] = rosterRows
        .map(r => ({
            ...r,
            teamName:   `Team ${r.rosterId}`,
            powerScore: computePowerScore(r.wins, r.losses, r.pf, r.pa, maxPf, maxPa),
        }))
        .sort((a, b) => b.powerScore - a.powerScore || b.pf - a.pf)
        .map((r, i) => ({ ...r, rank: i + 1 }));

    return { league: leagueResult, playerRankings, teamRankings, powerRankings, valueSyncedAt: latestSync?.updatedAt.toISOString() ?? null, lastSeasonRankings: false };
}
