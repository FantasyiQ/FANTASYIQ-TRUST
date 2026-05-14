// FantasyIQ Trust — Sleeper Stats Adapter
//
// Fetches 2024 (or 2025) season stats from the Sleeper API and converts them
// to the typed projection objects that buildLeagueDefensiveAndKickerRankings
// expects as inputs.
//
// Veterans:  stats → per-game → smoothed → ADP-adjusted (via projectionBuilder)
// Rookies:   no stats → ADP-boosted positional average (inline formula below)
// Fallback:  returns null on any API failure → caller uses seed projections

import { buildIdpProjections, buildKickerProjections, buildDefenseProjections } from './projectionBuilder';
import { toIdpPosition } from './seedProjections';
import type {
    RawIdpStats,
    RawKickerStats,
    RawDefenseStats,
    SleeperAdpEntry,
    IdpProjection,
    KickerProjection,
    DefenseProjection,
} from './defensiveTypes';
import type { SlimPlayer } from '@/lib/sleeper';

// ── Constants ──────────────────────────────────────────────────────────────────

const SLEEPER_STATS_URL = (season: string) =>
    `https://api.sleeper.app/v1/stats/nfl/regular/${season}`;

/** Coefficient of variation by stat — used to derive floor/ceiling from per-game averages. */
const STAT_CV: Record<string, number> = {
    // Volatile: sacks, turnovers, TDs
    sack:          0.85,
    int:           0.90,
    fumble_force:  0.85,
    def_td:        0.90,
    safe:          0.95,
    st_td:         0.90,
    // Moderate: TFLs, recoveries, pressures
    tackle_loss:   0.65,
    fumble_rec:    0.70,
    qb_hit:        0.60,
    pass_defended: 0.65,
    // Stable: tackles (volume stat)
    tackle_solo:   0.40,
    tackle_ast:    0.45,
    // Kicker
    fgm_40_49:     0.55,
    fgm_50p:       0.75,
    fgm:           0.40,
    xpm:           0.30,
    // DEF/ST
    pts_allow:     0.35,
};

function cv(statKey: string): number {
    return STAT_CV[statKey] ?? 0.60;
}

/** Derive `statVariance` (variance of per-game stat) from the annual total. */
function statVariance(seasonTotal: number, gamesPlayed: number, statKey: string): number {
    if (gamesPlayed === 0) return 0;
    const perGame = seasonTotal / gamesPlayed;
    const stdDev  = perGame * cv(statKey);
    return stdDev ** 2;
}

// ── Stat fetcher ───────────────────────────────────────────────────────────────

type SleeperStatsMap = Record<string, Record<string, number>>;

async function fetchSeasonStats(season: string): Promise<SleeperStatsMap | null> {
    try {
        const res = await fetch(SLEEPER_STATS_URL(season), {
            next: { revalidate: 3600 }, // cache for 1 hour
        });
        if (!res.ok) return null;
        return await res.json() as SleeperStatsMap;
    } catch {
        return null;
    }
}

// ── IDP raw stats builder ──────────────────────────────────────────────────────

function pickStat(s: Record<string, number>, ...keys: string[]): number {
    for (const k of keys) { if (s[k] !== undefined) return s[k]; }
    return 0;
}

function buildRawIdpStats(
    statsMap: SleeperStatsMap,
    allPlayers: Record<string, SlimPlayer>,
): RawIdpStats[] {
    const results: RawIdpStats[] = [];

    for (const [playerId, stats] of Object.entries(statsMap)) {
        const player = allPlayers[playerId];
        if (!player) continue;

        const idpPos = toIdpPosition(player.position);
        if (!idpPos) continue;

        const gpRaw = stats['gp'] ?? 0;
        if (gpRaw === 0) continue;  // skip players who didn't appear in a game
        const gp = gpRaw;

        // Sleeper 2025 IDP stats use idp_ prefix for individual defensive player stats
        const statVarianceMap: Partial<Record<string, number>> = {
            soloTackles:    statVariance(stats['idp_tkl_solo'] ?? 0, gp, 'tackle_solo'),
            sacks:          statVariance(stats['idp_sack']     ?? 0, gp, 'sack'),
            interceptions:  statVariance(stats['idp_int']      ?? 0, gp, 'int'),
            passesDefended: statVariance(stats['idp_pass_def'] ?? 0, gp, 'pass_defended'),
            forcedFumbles:  statVariance(stats['idp_ff']       ?? 0, gp, 'fumble_force'),
        };

        results.push({
            playerId,
            position:          idpPos,
            age:               player.age,
            gamesPlayed:       gp,
            soloTackles:       pickStat(stats, 'idp_tkl_solo'),
            assists:           pickStat(stats, 'idp_tkl_ast'),
            sacks:             pickStat(stats, 'idp_sack'),
            tfl:               pickStat(stats, 'idp_tkl_loss'),
            interceptions:     pickStat(stats, 'idp_int'),
            forcedFumbles:     pickStat(stats, 'idp_ff'),
            fumbleRecoveries:  pickStat(stats, 'idp_fum_rec'),
            passesDefended:    pickStat(stats, 'idp_pass_def'),
            defensiveTds:      pickStat(stats, 'idp_def_td'),
            safeties:          pickStat(stats, 'idp_safe'),
            qbHits:            pickStat(stats, 'idp_qb_hit'),
            statVariance:      statVarianceMap,
        });
    }

    return results;
}

// ── Kicker raw stats builder ───────────────────────────────────────────────────

function buildRawKickerStats(
    statsMap: SleeperStatsMap,
    allPlayers: Record<string, SlimPlayer>,
): RawKickerStats[] {
    const results: RawKickerStats[] = [];

    for (const [playerId, stats] of Object.entries(statsMap)) {
        const player = allPlayers[playerId];
        if (!player || player.position !== 'K') continue;

        const gpRaw = stats['gp'] ?? 0;
        if (gpRaw === 0) continue;  // skip non-participants
        const gp = gpRaw;

        // Sleeper stores fine-grained buckets; combine 0–19, 20–29, 30–39 into our 0–39 tier
        const fg0_39 =
            pickStat(stats, 'fgm_0_19') +
            pickStat(stats, 'fgm_20_29') +
            pickStat(stats, 'fgm_30_39') ||
            pickStat(stats, 'fgm_0_39');
        const fg40_49 = pickStat(stats, 'fgm_40_49');
        const fg50    = pickStat(stats, 'fgm_50p', 'fgm_50_59', 'fgm_60p');

        results.push({
            playerId,
            gamesPlayed:  gp,
            fg_0_39:      fg0_39,
            fg_40_49:     fg40_49,
            fg_50_plus:   fg50,
            xp:           pickStat(stats, 'xpm', 'xp_made'),
            missedFg:     pickStat(stats, 'fgmiss', 'fg_miss'),
            missedXp:     pickStat(stats, 'xpmiss', 'xp_miss'),
            statVariance: {
                fg_0_39:   statVariance(fg0_39,  gp, 'fgm'),
                fg_40_49:  statVariance(fg40_49, gp, 'fgm_40_49'),
                fg_50_plus: statVariance(fg50,   gp, 'fgm_50p'),
            },
        });
    }

    return results;
}

// ── DEF/ST raw stats builder ───────────────────────────────────────────────────

const NFL_TEAM_IDS = [
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE',
    'DAL','DEN','DET','GB', 'HOU','IND','JAX','KC',
    'LAC','LAR','LV', 'MIA','MIN','NE', 'NO', 'NYG',
    'NYJ','PHI','PIT','SEA','SF', 'TB', 'TEN','WAS',
];

/**
 * Builds a points-allowed per-game array from season totals.
 * Since we don't have weekly breakdowns, we approximate from the season avg
 * using a normal distribution (σ = 7 pts, which matches NFL variance roughly).
 */
function syntheticPaPerGame(seasonTotal: number, gamesPlayed: number): number[] {
    if (gamesPlayed === 0) return [];
    const avg    = seasonTotal / gamesPlayed;
    const stdDev = 7;
    // Simulate 17 game values using stratified sampling around the mean
    return Array.from({ length: gamesPlayed }, (_, i) => {
        // Evenly spaced z-scores across 17 games via inverse CDF approximation
        const u = (i + 0.5) / gamesPlayed;
        // Box-Muller approximation for a reasonable spread
        const z = Math.sqrt(-2 * Math.log(Math.max(u, 0.001))) *
                  Math.cos(2 * Math.PI * (i / gamesPlayed));
        return Math.max(0, Math.round(avg + z * stdDev));
    });
}

function buildRawDefenseStats(statsMap: SleeperStatsMap): RawDefenseStats[] {
    const results: RawDefenseStats[] = [];

    for (const teamId of NFL_TEAM_IDS) {
        // Sleeper stats API may key team defenses as "BUF" or "TEAM_BUF"
        const stats = statsMap[teamId] ?? statsMap[`TEAM_${teamId}`];
        if (!stats) continue;

        const gpRaw = stats['gp'] ?? 0;
        const gp    = gpRaw > 0 ? gpRaw : 17;  // DEF stats don't always include gp; assume full season
        const ptsAllow = pickStat(stats, 'pts_allow', 'pts_allowed');

        results.push({
            teamId,
            gamesPlayed:          gp,
            sacks:                pickStat(stats, 'sack', 'pass_sack'),
            interceptions:        pickStat(stats, 'int', 'pass_int'),
            fumbleRecoveries:     pickStat(stats, 'fum_rec', 'fumble_rec', 'fr'),
            defensiveTds:         pickStat(stats, 'def_st_td', 'def_td'),
            safeties:             pickStat(stats, 'safe'),
            returnTds:            pickStat(stats, 'def_st_td', 'st_td'),
            pointsAllowedPerGame: syntheticPaPerGame(ptsAllow, gp),
            statVariance: {
                sacks:         statVariance(pickStat(stats, 'sack'), gp, 'sack'),
                interceptions: statVariance(pickStat(stats, 'int'), gp, 'int'),
            },
        });
    }

    return results;
}

// ── ADP proxy builder ──────────────────────────────────────────────────────────
// Real Sleeper ADP isn't stored in our DB, so we proxy it from 2024 performance.
// Players ranked by a composite score within their position group get an ADP
// percentile that approximates market value.

function compositeIdpScore(stats: Record<string, number>, pos: 'DL' | 'LB' | 'DB'): number {
    switch (pos) {
        case 'DL':
            return pickStat(stats, 'idp_sack')     * 3
                 + pickStat(stats, 'idp_tkl_solo') * 0.5
                 + pickStat(stats, 'idp_tkl_loss') * 1
                 + pickStat(stats, 'idp_qb_hit')   * 0.5
                 + pickStat(stats, 'idp_int')       * 2;
        case 'LB':
            return pickStat(stats, 'idp_tkl_solo') * 1
                 + pickStat(stats, 'idp_tkl_ast')  * 0.5
                 + pickStat(stats, 'idp_sack')     * 2
                 + pickStat(stats, 'idp_int')       * 3
                 + pickStat(stats, 'idp_tkl_loss') * 1;
        case 'DB':
            return pickStat(stats, 'idp_int')      * 4
                 + pickStat(stats, 'idp_pass_def') * 1.5
                 + pickStat(stats, 'idp_tkl_solo') * 0.5
                 + pickStat(stats, 'idp_ff')       * 2
                 + pickStat(stats, 'idp_def_td')   * 3;
        default:
            return 0;
    }
}

function buildAdpEntries(
    statsMap: SleeperStatsMap,
    allPlayers: Record<string, SlimPlayer>,
): SleeperAdpEntry[] {
    const entries: SleeperAdpEntry[] = [];

    const idpByPos: Record<string, { id: string; score: number }[]> = { DL: [], LB: [], DB: [] };
    const kickers:  { id: string; score: number }[] = [];
    const defenses: { id: string; score: number }[] = [];

    for (const [playerId, stats] of Object.entries(statsMap)) {
        const player = allPlayers[playerId];
        if (!player) continue;

        const idpPos = toIdpPosition(player.position);
        if (idpPos) {
            idpByPos[idpPos]?.push({ id: playerId, score: compositeIdpScore(stats, idpPos) });
        } else if (player.position === 'K') {
            kickers.push({ id: playerId, score: pickStat(stats, 'fgm') + pickStat(stats, 'xpm') * 0.3 });
        }
    }

    for (const teamId of NFL_TEAM_IDS) {
        const stats = statsMap[teamId];
        if (stats) {
            const score = pickStat(stats, 'sack') * 2
                        + pickStat(stats, 'int') * 3
                        + pickStat(stats, 'def_td') * 5
                        - (pickStat(stats, 'pts_allow') / 17); // lower PA is better
            defenses.push({ id: teamId, score });
        }
    }

    // Rank within group (higher score = better = lower adp number)
    function rankToEntries(
        group: { id: string; score: number }[],
        position: SleeperAdpEntry['position'],
    ): SleeperAdpEntry[] {
        return group
            .sort((a, b) => b.score - a.score)
            .map((e, i) => ({ id: e.id, position, adp: i + 1 }));
    }

    entries.push(...rankToEntries(idpByPos['DL'] ?? [], 'DL'));
    entries.push(...rankToEntries(idpByPos['LB'] ?? [], 'LB'));
    entries.push(...rankToEntries(idpByPos['DB'] ?? [], 'DB'));
    entries.push(...rankToEntries(kickers,  'K'));
    entries.push(...rankToEntries(defenses, 'DEF'));

    return entries;
}

// ── Rookie projection builder ──────────────────────────────────────────────────

/**
 * For any player in allPlayers who has no 2024 stats entry, create a synthetic
 * RawIdpStats / RawKickerStats using:
 *
 *   projectedStat = base × (1 + 0.4 × adpPercentile + noise)
 *
 * where `base` is the positional average per-game and `noise` is ±5%.
 * The entry uses gamesPlayed=17 so the projection builder treats it as a
 * full-season estimate and applies normal smoothing + ADP weighting.
 */
function seededRandom(seed: number): number {
    // Deterministic pseudo-random in [-0.05, 0.05] — consistent across invocations
    const x = Math.sin(seed + 1) * 10000;
    return ((x - Math.floor(x)) - 0.5) * 0.1;
}

function buildRookieIdpStats(
    allPlayers:  Record<string, SlimPlayer>,
    veteranIds:  Set<string>,
    adpEntries:  SleeperAdpEntry[],
    posAvgs:     Record<'DL' | 'LB' | 'DB', Record<string, number>>,
): RawIdpStats[] {
    const adpMap = new Map(adpEntries.map(e => [e.id, e.adp]));

    // Compute ADP percentile from rank (lower rank = higher percentile)
    const posMaxRank: Record<string, number> = { DL: 0, LB: 0, DB: 0 };
    for (const e of adpEntries) {
        if (e.position in posMaxRank) {
            posMaxRank[e.position] = Math.max(posMaxRank[e.position], e.adp);
        }
    }

    const rookies: RawIdpStats[] = [];
    let seedCounter = 0;

    for (const [playerId, player] of Object.entries(allPlayers)) {
        if (veteranIds.has(playerId)) continue;
        const idpPos = toIdpPosition(player.position);
        if (!idpPos) continue;

        const rank    = adpMap.get(playerId);
        const maxRank = posMaxRank[idpPos] || 100;
        // Higher ADP (lower pick number) → higher percentile
        const adpPercentile = rank !== undefined
            ? 1 - (rank - 1) / Math.max(maxRank - 1, 1)
            : 0.5; // unknown ADP → market average

        const avg    = posAvgs[idpPos];
        const noise  = seededRandom(seedCounter++);
        const boost  = 1 + 0.4 * adpPercentile + noise;

        rookies.push({
            playerId,
            position:          idpPos,
            gamesPlayed:       17, // full projection season
            soloTackles:       (avg['tackle_solo'] ?? 0) * boost,
            assists:           (avg['tackle_ast']  ?? 0) * boost,
            sacks:             (avg['sack']        ?? 0) * boost,
            tfl:               (avg['tackle_loss'] ?? 0) * boost,
            interceptions:     (avg['int']         ?? 0) * boost,
            forcedFumbles:     (avg['fumble_force']?? 0) * boost,
            fumbleRecoveries:  (avg['fumble_rec']  ?? 0) * boost,
            passesDefended:    (avg['pass_defended']?? 0)* boost,
            defensiveTds:      (avg['def_td']      ?? 0) * boost,
            safeties:          (avg['safe']        ?? 0) * boost,
            qbHits:            (avg['qb_hit']      ?? 0) * boost,
        });
    }

    return rookies;
}

function buildRookieKickerStats(
    allPlayers:  Record<string, SlimPlayer>,
    veteranIds:  Set<string>,
    adpEntries:  SleeperAdpEntry[],
): RawKickerStats[] {
    const adpMap  = new Map(adpEntries.map(e => [e.id, e.adp]));
    const maxRank = Math.max(0, ...adpEntries.filter(e => e.position === 'K').map(e => e.adp));

    // Kicker season averages (per season, not per game — gamesPlayed=17)
    const BASE = { fg_0_39: 13, fg_40_49: 9, fg_50_plus: 4, xp: 32, missedFg: 3, missedXp: 1 };
    const rookies: RawKickerStats[] = [];
    let seed = 100;

    for (const [playerId, player] of Object.entries(allPlayers)) {
        if (veteranIds.has(playerId) || player.position !== 'K') continue;

        const rank    = adpMap.get(playerId);
        const adpPct  = rank !== undefined ? 1 - (rank - 1) / Math.max(maxRank - 1, 1) : 0.5;
        const noise   = seededRandom(seed++);
        const boost   = 1 + 0.4 * adpPct + noise;

        rookies.push({
            playerId,
            gamesPlayed: 17,
            fg_0_39:     BASE.fg_0_39     * boost,
            fg_40_49:    BASE.fg_40_49    * boost,
            fg_50_plus:  BASE.fg_50_plus  * boost,
            xp:          BASE.xp          * boost,
            missedFg:    BASE.missedFg,  // misses don't scale with ADP
            missedXp:    BASE.missedXp,
        });
    }

    return rookies;
}

// ── Positional average helper ──────────────────────────────────────────────────

function computePositionalAvgPerGame(
    stats: RawIdpStats[],
    pos:   'DL' | 'LB' | 'DB',
): Record<string, number> {
    const group = stats.filter(s => s.position === pos);
    if (group.length === 0) return {};

    const keys = ['soloTackles','assists','sacks','tfl','interceptions',
                  'forcedFumbles','fumbleRecoveries','passesDefended',
                  'defensiveTds','safeties','qbHits'] as const;

    return Object.fromEntries(keys.map(k => {
        const avg = group.reduce((sum, s) => sum + (s[k] ?? 0) / Math.max(s.gamesPlayed, 1), 0) / group.length;
        return [
            // map to the Sleeper key name used in rookieBuilder
            k === 'soloTackles'      ? 'tackle_solo'   :
            k === 'assists'          ? 'tackle_ast'    :
            k === 'sacks'            ? 'sack'          :
            k === 'tfl'              ? 'tackle_loss'   :
            k === 'interceptions'    ? 'int'           :
            k === 'forcedFumbles'    ? 'fumble_force'  :
            k === 'fumbleRecoveries' ? 'fumble_rec'    :
            k === 'passesDefended'   ? 'pass_defended' :
            k === 'defensiveTds'     ? 'def_td'        :
            k === 'safeties'         ? 'safe'          :
            k,  // qbHits → qb_hit not needed here since we use per-season in rookie builder
            avg,
        ];
    }));
}

// ── Offensive top-5 projected points ──────────────────────────────────────────
// Computes average projected season fantasy points for the top 5 players at
// each offensive position using the league's actual scoring settings.
// Used by the defensive engine to derive IDP position caps relative to QB value.

function buildOffensiveTop5Avg(
    statsMap:        SleeperStatsMap,
    allPlayers:      Record<string, SlimPlayer>,
    scoringSettings: Record<string, number>,
): Record<string, number> {
    const byPos: Record<string, number[]> = { QB: [], RB: [], WR: [], TE: [] };

    for (const [playerId, stats] of Object.entries(statsMap)) {
        const player = allPlayers[playerId];
        if (!player || !(player.position in byPos)) continue;
        if ((stats['gp'] ?? 0) === 0) continue;

        // Sum every stat key that appears in scoring_settings
        let pts = 0;
        for (const [key, val] of Object.entries(stats)) {
            const pointVal = scoringSettings[key];
            if (pointVal !== undefined) pts += val * pointVal;
        }
        if (pts > 0) byPos[player.position].push(pts);
    }

    const result: Record<string, number> = {};
    for (const [pos, points] of Object.entries(byPos)) {
        const top5 = [...points].sort((a, b) => b - a).slice(0, 5);
        if (top5.length > 0) result[pos] = top5.reduce((s, v) => s + v, 0) / top5.length;
    }
    return result;
}

// ── Main export ────────────────────────────────────────────────────────────────

export type DefensiveProjections = {
    idpProjections:     IdpProjection[];
    kickerProjections:  KickerProjection[];
    defenseProjections: DefenseProjection[];
    /** Average projected season fantasy points for top-5 players per offensive position. */
    offensiveTop5Avg:   Record<string, number>;
};

/**
 * Fetches Sleeper season stats, builds typed projections for veterans and
 * rookies, and returns them ready for buildLeagueDefensiveAndKickerRankings.
 *
 * Returns null on API failure — caller should fall back to seed projections.
 */
export async function buildProjectionsFromSleeperStats(
    season:          string,
    allPlayers:      Record<string, SlimPlayer>,
    scoringSettings: Record<string, number> = {},
): Promise<DefensiveProjections | null> {
    const statsMap = await fetchSeasonStats(season);
    if (!statsMap || Object.keys(statsMap).length === 0) return null;

    // ── Veterans (have 2024 stats) ────────────────────────────────────────────
    const veteranIdpStats    = buildRawIdpStats(statsMap, allPlayers);
    const veteranKickerStats = buildRawKickerStats(statsMap, allPlayers);
    const veteranDefStats    = buildRawDefenseStats(statsMap);

    if (veteranIdpStats.length === 0 && veteranKickerStats.length === 0) {
        // Stats endpoint returned data but no IDP/K matches — likely wrong season or format
        return null;
    }

    // ── ADP proxy (from 2024 performance rank) ────────────────────────────────
    const adpEntries = buildAdpEntries(statsMap, allPlayers);

    // ── Rookies (in Sleeper DB but no stats) ─────────────────────────────────
    const veteranIds = new Set([
        ...veteranIdpStats.map(s => s.playerId),
        ...veteranKickerStats.map(s => s.playerId),
    ]);

    const posAvgs: Record<'DL' | 'LB' | 'DB', Record<string, number>> = {
        DL: computePositionalAvgPerGame(veteranIdpStats, 'DL'),
        LB: computePositionalAvgPerGame(veteranIdpStats, 'LB'),
        DB: computePositionalAvgPerGame(veteranIdpStats, 'DB'),
    };

    const rookieIdpStats    = buildRookieIdpStats(allPlayers, veteranIds, adpEntries, posAvgs);
    const rookieKickerStats = buildRookieKickerStats(allPlayers, veteranIds, adpEntries);

    // ── Build final projections ────────────────────────────────────────────────
    const allIdpStats    = [...veteranIdpStats,    ...rookieIdpStats];
    const allKickerStats = [...veteranKickerStats, ...rookieKickerStats];

    return {
        idpProjections:     buildIdpProjections(allIdpStats,    adpEntries),
        kickerProjections:  buildKickerProjections(allKickerStats, adpEntries),
        defenseProjections: buildDefenseProjections(veteranDefStats, adpEntries),
        offensiveTop5Avg:   buildOffensiveTop5Avg(statsMap, allPlayers, scoringSettings),
    };
}
