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
// A naive linear percentile of Sleeper ADP was tried next for players/
// positions FantasyCalc doesn't cover (K, and DEF by extension) and also
// rejected: a straight rank-to-percentile transform stretches EVERY pool to
// fill the full 1-100 range regardless of that pool's real ceiling, so the
// single best-ADP kicker (real ADP ~100+) or best-scoring defense always
// landed near 100 — competing directly with legitimate top-15 skill
// players, which no real redraft market ever does. Fixed by calibrating ADP
// against FantasyCalc's real value curve instead of inventing an
// independent scale: for every player who has BOTH signals, we know their
// real (ADP, FantasyCalc value) pair — interpolating along that real curve
// gives an ADP-only player (K) an honestly-scaled value. DEF has no ADP
// signal at all, so it's anchored directly below the worst real
// FantasyCalc-covered skill player in the pool (see worstRealFcValue below)
// — real market's own boundary, not a fabricated number.

import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import {
    computeRealPoints, computePerfFactor, toStatsPerGame,
    computePositionScoringFactor, combineScoringFactors, STANDARD_SCORING,
    computeRealProjectedPoints,
} from './leagueScoringPoints';

// Full-sample proxy for computePerfFactor's games-played regression weight —
// a real weekly projection already reflects a full-season depth-chart/
// opportunity estimate, not a small in-season sample that needs smoothing
// toward the mean, so it should get the same full individual weight a
// veteran with a complete season of stats would.
const PROJECTION_FULL_SAMPLE_PROXY = 17;

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
    projPtsPerGame: number | null;        // real projected points — only set when hasRealData is false
    hasProjData:    boolean;
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

    // Rookies and other stat-less players have no real season production to
    // rank by — real projected points (Sleeper's per-stat weekly projection,
    // run through this league's real scoring settings) is the best honest
    // signal available for them, in place of falling back on ADP alone.
    const projWeek = nflState.week > 0 ? nflState.week : 1;
    const eligiblePlayerIds = rawPlayers.map(p => p.playerId);
    let projectionRows = await prisma.playerProjection.findMany({
        where:  { season: statsSeason, week: projWeek, playerId: { in: eligiblePlayerIds } },
        select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true, rawProjection: true },
    });
    if (projectionRows.length === 0) {
        // The requested season/week has no real data yet (e.g. the sync
        // cron's own date heuristic can land on a different season/week
        // than Sleeper's live nflState during the preseason calendar
        // crossover) — fall back to whatever real projection snapshot is
        // most recently available, rather than showing nothing.
        const latest = await prisma.playerProjection.findFirst({
            orderBy: [{ season: 'desc' }, { week: 'desc' }],
            select: { season: true, week: true },
        });
        if (latest) {
            projectionRows = await prisma.playerProjection.findMany({
                where:  { season: latest.season, week: latest.week, playerId: { in: eligiblePlayerIds } },
                select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true, rawProjection: true },
            });
        }
    }
    const projByPlayerId = new Map(
        projectionRows.map(r => [r.playerId, computeRealProjectedPoints(
            r.rawProjection as Record<string, number> | null, scoringSettings, r, null,
        )])
    );

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

    // ── Real ADP↔FantasyCalc calibration curve ──────────────────────────────
    // Built from every player in THIS pool who has both a real Sleeper ADP
    // and a real FantasyCalc redraft value — the actual, observed shape of
    // how the market prices each draft slot, not an invented formula.
    // Sleeper uses sentinel values for "unranked" rather than leaving
    // searchRank null — 9999999 for fully unranked players, and a cluster of
    // hundreds of distinct players all tied at exactly 999 (statistically
    // impossible as a genuine continuous rank). Neither is a real distinct
    // market position; treating either as real ADP corrupts the calibration
    // curve's tail and, through it, DEF's anchor point.
    const SLEEPER_UNRANKED_SENTINEL = 999;
    const calibPoints: { adp: number; fcValue: number }[] = [];
    for (const p of eligible) {
        if (p.searchRank == null || p.searchRank >= SLEEPER_UNRANKED_SENTINEL) continue;
        const fc = resolveFc(p.fullName ?? '', p.position ?? '');
        if (!fc) continue;
        calibPoints.push({ adp: p.searchRank, fcValue: superflex ? fc.redraftValueSf : fc.redraftValue });
    }
    calibPoints.sort((a, b) => a.adp - b.adp);

    // Linear interpolation along the real curve; clamps to the nearest real
    // endpoint value for an ADP outside the observed range (e.g. beyond the
    // worst real ADP in the pool) rather than extrapolating a guess.
    function estimateFcValueFromAdp(adp: number): number {
        if (calibPoints.length === 0) return 0;
        if (adp <= calibPoints[0].adp) return calibPoints[0].fcValue;
        const last = calibPoints[calibPoints.length - 1];
        if (adp >= last.adp) return last.fcValue;
        let lo = 0, hi = calibPoints.length - 1;
        while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (calibPoints[mid].adp <= adp) lo = mid; else hi = mid;
        }
        const a = calibPoints[lo], b = calibPoints[hi];
        const t = b.adp === a.adp ? 0 : (adp - a.adp) / (b.adp - a.adp);
        return a.fcValue + t * (b.fcValue - a.fcValue);
    }

    // ── Pass 1: real per-game production + positional averages for perfFactor ─
    const posPtsSum = new Map<string, number>();
    const posPtsCount = new Map<string, number>();
    const posStdPtsSum = new Map<string, number>();
    type Pending = { p: (typeof eligible)[number]; realPtsPerGame: number; standardPtsPerGame: number; gamesPlayed: number | null };
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
        pending.push({ p, realPtsPerGame, standardPtsPerGame, gamesPlayed: stats?.gamesPlayed ?? null });
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

    // Positional average of real PROJECTED points, computed only from
    // players who have real season stats — the positional baseline a
    // rookie's projection gets compared against should be "what an
    // established player at this position actually produces," not other
    // projections (which would just compare rookies to each other).
    const posProjPtsSum   = new Map<string, number>();
    const posProjPtsCount = new Map<string, number>();
    for (const { p, gamesPlayed } of pending) {
        if (!gamesPlayed) continue;
        const proj = projByPlayerId.get(p.playerId);
        if (proj == null) continue;
        const pos = p.position ?? '';
        posProjPtsSum.set(pos, (posProjPtsSum.get(pos) ?? 0) + proj);
        posProjPtsCount.set(pos, (posProjPtsCount.get(pos) ?? 0) + 1);
    }
    const posAvgProjPtsPerGame = new Map<string, number>();
    for (const [pos, sum] of posProjPtsSum) posAvgProjPtsPerGame.set(pos, sum / (posProjPtsCount.get(pos) ?? 1));

    // ── DEF anchor: real production→value curve (no ADP/FC signal for D/ST) ──
    // Neither Sleeper ADP nor FantasyCalc cover team defenses, so there's no
    // direct market signal to calibrate against. Instead, build a second real
    // curve — real points/game UNDER THIS LEAGUE'S OWN SCORING → FantasyCalc
    // value, from skill players who have both — and look up the value real
    // skill players who score like an average real defense (on the exact
    // same real scoring scale) actually carry in the market. Deliberately
    // NOT the STANDARD_SCORING baseline: it only defines offensive stat
    // keys, so every defense would compute to exactly 0 points against it,
    // collapsing this anchor to a worthless-outlier value regardless of the
    // league's real defensive scoring. realPtsPerGame is apples-to-apples —
    // both sides run through the same league scoring_settings dot product.
    const pointsCalibPoints: { pts: number; fcValue: number }[] = [];
    for (const { p, realPtsPerGame, gamesPlayed } of pending) {
        if (!gamesPlayed) continue;
        const fc = resolveFc(p.fullName ?? '', p.position ?? '');
        if (!fc) continue;
        pointsCalibPoints.push({ pts: realPtsPerGame, fcValue: superflex ? fc.redraftValueSf : fc.redraftValue });
    }
    // Real per-game production is a much noisier predictor of market value
    // than ADP (a bench player can post a great single-sample rate off a
    // crowded backfield opportunity while carrying near-zero real trade
    // value) — a precise 2-point interpolation is fragile here and can land
    // its bracket squarely between two outliers. Averaging over the nearest
    // real neighborhood smooths that noise without fabricating anything.
    const POINTS_CALIB_WINDOW = 15;
    function estimateFcValueFromPoints(pts: number): number {
        if (pointsCalibPoints.length === 0) return 0;
        const windowSize = Math.min(POINTS_CALIB_WINDOW, pointsCalibPoints.length);
        const nearest = [...pointsCalibPoints]
            .sort((a, b) => Math.abs(a.pts - pts) - Math.abs(b.pts - pts))
            .slice(0, windowSize);
        return nearest.reduce((sum, c) => sum + c.fcValue, 0) / nearest.length;
    }
    const defAnchorFcValue = estimateFcValueFromPoints(posAvgPtsPerGame.get('DEF') ?? 0);

    const defRanked = pending
        .filter(x => x.p.position === 'DEF')
        .sort((a, b) => b.realPtsPerGame - a.realPtsPerGame);
    const defValue = new Map<string, number>();
    defRanked.forEach((x, i) => {
        const frac = defRanked.length > 1 ? 1 - i / (defRanked.length - 1) : 1; // 1 = best DEF, ~0 = worst
        defValue.set(x.p.playerId, frac * defAnchorFcValue);
    });

    // ── Pass 2: blend market value + real-scoring nudge into a final rank ───
    const players = pending.map(({ p, realPtsPerGame, gamesPlayed }) => {
        const pos = p.position ?? '';
        let finalValue: number;

        if (pos === 'DEF') {
            finalValue = normaliseFcValue(defValue.get(p.playerId) ?? 0);
        } else {
            const fc       = resolveFc(p.fullName ?? '', pos);
            const rawFcValue = fc ? (superflex ? fc.redraftValueSf : fc.redraftValue) : null;
            // Even players with real FC coverage get their ADP cross-checked
            // against the real calibration curve (not a separately-scaled
            // percentile) so both signals live on the same real value scale
            // before blending — averaging two differently-shaped scales was
            // what distorted mid/late-pick ordering in the first place.
            const adpImpliedValue = p.searchRank != null ? estimateFcValueFromAdp(p.searchRank) : rawFcValue ?? 0;
            const rawBaseValue = rawFcValue != null ? (rawFcValue + adpImpliedValue) / 2 : adpImpliedValue;
            const baseValue = normaliseFcValue(rawBaseValue);

            // No season stats yet (rookies, new signings) — nudge off real
            // projected points instead of leaving the market-consensus base
            // untouched, using the same full individual weight a complete
            // season of real stats would get (a projection is already a
            // full-season estimate, not a small sample to regress).
            const projPts = !gamesPlayed ? projByPlayerId.get(p.playerId) ?? null : null;
            const individualFactor = gamesPlayed
                ? computePerfFactor(realPtsPerGame, posAvgPtsPerGame.get(pos) ?? 0, gamesPlayed)
                : projPts != null
                    ? computePerfFactor(projPts, posAvgProjPtsPerGame.get(pos) ?? 0, PROJECTION_FULL_SAMPLE_PROXY)
                    : 1.0;
            const positionFactor = posScoringFactor.get(pos) ?? 1.0;
            const perfFactor      = combineScoringFactors(individualFactor, positionFactor);

            // Capped additive nudge, not a multiplier — a multiplier on an
            // already ~1-100 bounded value saturates the top of the board to
            // identical scores (see the same fix applied in contextLoader.ts).
            const perfAdjustment = Math.round((perfFactor - 1) * 20);
            finalValue = Math.min(100, Math.max(1, baseValue + perfAdjustment));
        }

        const projPtsForDisplay = pos !== 'DEF' && !gamesPlayed ? projByPlayerId.get(p.playerId) ?? null : null;

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
            projPtsPerGame: projPtsForDisplay,
            hasProjData:    projPtsForDisplay != null,
            finalValue,
        };
    });

    return players
        .sort((a, b) => b.finalValue - a.finalValue)
        .slice(0, limit)
        .map(({ finalValue: _finalValue, ...rest }) => rest);
}
