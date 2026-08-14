// FantasyIQ Trust — Real Redraft Big Board
//
// Ranks players for a specific league's redraft board using real market
// consensus (Sleeper ADP + FantasyCalc redraft value) as the base, then
// nudges that base by how a player's real per-game production compares to
// their position's average under this league's exact scoring settings (via
// the League Scoring Points Engine) — the same architecture already proven
// on Dynasty rankings, just applied to the redraft market.
//
// Raw real points were tried as the PRIMARY sort key first and rejected:
// under most scoring formats a starting QB outscores every RB/WR on paper
// (passing stats accumulate fastest), which doesn't reflect real 1-QB-league
// value — a QB you can replace off waivers is worth far less than a scarce
// RB1, no matter how many raw points he scores. Real fantasy rankings are
// about value relative to replacement, which market consensus (real human
// drafters + FantasyCalc's market-derived redraft value) already encodes.
// League-specific scoring should nudge that consensus, not override it.
//
// DEF is the one exception: neither Sleeper ADP nor FantasyCalc cover team
// defenses at all, so there's no market signal to anchor to — real points
// under the league's own scoring (percentile-ranked among defenses) is the
// only honest signal available for that position.

import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import {
    computeRealPoints, computePerfFactor, toStatsPerGame,
    computePositionScoringFactor, combineScoringFactors, STANDARD_SCORING,
} from './leagueScoringPoints';

const REDRAFT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const MAX_PLAUSIBLE_AGE = 45;      // no real NFL player plays past their mid-40s
const FC_VALUE_CAP      = 9999;    // FantasyCalc's own value ceiling (matches getLeagueRankings.ts)

export interface RealRedraftPlayer {
    playerId:       string;
    name:           string;
    position:       string;
    team:           string | null;
    age:            number | null;
    birthDate:      string | null;
    injuryStatus:   string | null;
    adp:            number;              // Sleeper searchRank — real market ADP, shown for reference
    realPtsPerGame: number | null;        // null when the player has no season stats yet
    hasRealData:    boolean;
}

function normaliseFcValue(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / FC_VALUE_CAP) * 100)));
}

export async function computeRealRedraftBoard(
    scoringSettings: Record<string, number>,
    superflex = false,
    limit = 300,
): Promise<RealRedraftPlayer[]> {
    const nflState    = await getNflState();
    const statsSeason = nflState.season;

    const [rawPlayers, currentSeasonStats, fcRows] = await Promise.all([
        prisma.sleeperPlayer.findMany({
            where: {
                position: { in: [...REDRAFT_POSITIONS] },
                team:     { not: 'FA' }, // not rostered anywhere = zero real value this season
                // Sleeper never assigns a searchRank to team defenses (always
                // null), so requiring one would silently drop every DEF from
                // the board — only require it for individual skill players.
                OR: [
                    { searchRank: { not: null } },
                    { position: 'DEF' },
                ],
            },
            select: {
                playerId: true, fullName: true, position: true, team: true,
                birthDate: true, age: true, searchRank: true, injuryStatus: true,
            },
        }),
        prisma.playerSeasonStats.findMany({
            where:  { season: statsSeason },
            select: { playerId: true, gamesPlayed: true, rawStats: true },
        }),
        // FantasyCalc doesn't cover K/DEF — QB/RB/WR/TE only, matches every
        // other consumer of this table in the codebase.
        prisma.fantasyCalcValue.findMany({
            where:  { position: { in: ['QB', 'RB', 'WR', 'TE'] } },
            select: { nameLower: true, position: true, redraftValue: true, redraftValueSf: true },
        }),
    ]);

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

    // FantasyCalc redraft value, resolved by name+position (exact, then a
    // normalized-name fallback only when that name is unambiguous) — mirrors
    // the resolver pattern used in getLeagueRankings.ts / contextLoader.ts so
    // two real players sharing a name never cross-attach.
    const fcByNamePos = new Map<string, { redraftValue: number; redraftValueSf: number }>();
    const fcByName     = new Map<string, { redraftValue: number; redraftValueSf: number }>();
    const fcNameCount  = new Map<string, number>();
    for (const fc of fcRows) {
        fcByNamePos.set(`${fc.nameLower}|${fc.position}`, fc);
        fcNameCount.set(fc.nameLower, (fcNameCount.get(fc.nameLower) ?? 0) + 1);
        fcByName.set(fc.nameLower, fc);
    }
    function resolveFc(fullName: string, position: string) {
        const nameLower = fullName.toLowerCase();
        return fcByNamePos.get(`${nameLower}|${position}`)
            ?? (fcNameCount.get(nameLower) === 1 ? fcByName.get(nameLower) : undefined);
    }

    // Sleeper's active flag is unreliable for long-retired players still
    // marked active — a real computed-age cutoff catches what team!=FA
    // alone can miss (see feedback_stale_sleeper_player_data).
    const eligible = rawPlayers.filter(p => {
        if (!p.birthDate) return true; // team defenses — no birthDate, always fine
        const dob = new Date(p.birthDate);
        if (isNaN(dob.getTime())) return true;
        const age = new Date().getFullYear() - dob.getFullYear();
        return age <= MAX_PLAUSIBLE_AGE;
    });

    // ── Real market ADP, converted to a 1-100 percentile within this pool ───
    const adpRanked = eligible
        .filter(p => p.searchRank != null)
        .sort((a, b) => (a.searchRank ?? 0) - (b.searchRank ?? 0));
    const adpPercentile = new Map<string, number>();
    adpRanked.forEach((p, i) => {
        const pct = adpRanked.length > 1 ? 100 * (1 - i / (adpRanked.length - 1)) : 100;
        adpPercentile.set(p.playerId, Math.max(1, Math.round(pct)));
    });

    // ── Pass 1: real per-game production + positional averages for perfFactor ─
    const posPtsSum = new Map<string, number>();
    const posPtsCount = new Map<string, number>();
    const posStdPtsSum = new Map<string, number>();
    type Pending = { p: (typeof eligible)[number]; realPtsPerGame: number; gamesPlayed: number | null };
    const pending: Pending[] = [];
    for (const p of eligible) {
        const stats = statsByPlayerId.get(p.playerId);
        const realPtsPerGame     = stats ? computeRealPoints(stats.statsPerGame, scoringSettings) : 0;
        const standardPtsPerGame = stats ? computeRealPoints(stats.statsPerGame, STANDARD_SCORING) : 0;
        if (stats && stats.gamesPlayed) {
            const pos = p.position ?? '';
            posPtsSum.set(pos, (posPtsSum.get(pos) ?? 0) + realPtsPerGame);
            posPtsCount.set(pos, (posPtsCount.get(pos) ?? 0) + 1);
            posStdPtsSum.set(pos, (posStdPtsSum.get(pos) ?? 0) + standardPtsPerGame);
        }
        pending.push({ p, realPtsPerGame, gamesPlayed: stats?.gamesPlayed ?? null });
    }
    const posAvgPtsPerGame = new Map<string, number>();
    const posStdAvgPtsPerGame = new Map<string, number>();
    for (const [pos, sum] of posPtsSum)    posAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
    for (const [pos, sum] of posStdPtsSum) posStdAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
    const posScoringFactor = new Map<string, number>();
    for (const pos of posAvgPtsPerGame.keys()) {
        posScoringFactor.set(pos, computePositionScoringFactor(
            posAvgPtsPerGame.get(pos) ?? 0,
            posStdAvgPtsPerGame.get(pos) ?? 0,
        ));
    }

    // ── DEF-only real-points percentile (no market source exists for D/ST) ──
    const defRanked = pending
        .filter(x => x.p.position === 'DEF')
        .sort((a, b) => b.realPtsPerGame - a.realPtsPerGame);
    const defPercentile = new Map<string, number>();
    defRanked.forEach((x, i) => {
        const pct = defRanked.length > 1 ? 100 * (1 - i / (defRanked.length - 1)) : 100;
        defPercentile.set(x.p.playerId, Math.max(1, Math.round(pct)));
    });

    // ── Pass 2: blend market value + real-scoring nudge into a final rank ───
    const players = pending.map(({ p, realPtsPerGame, gamesPlayed }) => {
        const pos = p.position ?? '';
        let finalValue: number;

        if (pos === 'DEF') {
            // Real points already the sole anchor — no separate nudge on top.
            finalValue = defPercentile.get(p.playerId) ?? 1;
        } else {
            const fc       = resolveFc(p.fullName ?? '', pos);
            const fcValue  = fc ? normaliseFcValue(superflex ? fc.redraftValueSf : fc.redraftValue) : null;
            const adpValue = adpPercentile.get(p.playerId) ?? 1;
            const baseValue = fcValue != null ? Math.round((fcValue + adpValue) / 2) : adpValue;

            const individualFactor = gamesPlayed
                ? computePerfFactor(realPtsPerGame, posAvgPtsPerGame.get(pos) ?? 0, gamesPlayed)
                : 1.0;
            const positionFactor = posScoringFactor.get(pos) ?? 1.0;
            const perfFactor      = combineScoringFactors(individualFactor, positionFactor);

            // Capped additive nudge, not a multiplier — a multiplier on an
            // already ~1-100 bounded value saturates the top of the board to
            // identical scores (see the same fix applied in contextLoader.ts).
            const perfAdjustment = Math.round((perfFactor - 1) * 20);
            finalValue = Math.min(100, Math.max(1, baseValue + perfAdjustment));
        }

        return {
            playerId:       p.playerId,
            name:           p.fullName ?? '',
            position:       pos,
            team:           p.team,
            age:            p.age,
            birthDate:      p.birthDate,
            injuryStatus:   p.injuryStatus,
            adp:            p.searchRank ?? 999,
            realPtsPerGame: gamesPlayed ? realPtsPerGame : null,
            hasRealData:    Boolean(gamesPlayed),
            finalValue,
        };
    });

    return players
        .sort((a, b) => b.finalValue - a.finalValue)
        .slice(0, limit)
        .map(({ finalValue: _finalValue, ...rest }) => rest);
}
