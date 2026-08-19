// FantasyIQ Trust — Real Redraft Big Board
//
// Ranks players for a specific league's redraft board by real projected
// SEASON points under that league's exact scoring settings, blended with
// real Sleeper ADP. Explicit design, confirmed directly by the user:
// "Projected points for the season. Rank them highest to lowest points
// based on scoring settings in that league" — points are the primary
// driver, not a bounded nudge on top of a market-value anchor.
//
// Why ADP is still blended in, not points alone: verified live that pure
// season points puts 15 different QBs above the real consensus #1 overall
// picks (Jahmyr Gibbs, Bijan Robinson — both real ADP 1), including
// several deep-ADP veteran QBs (e.g. a QB with real ADP 77 outscoring
// them on paper) — because passing stats accumulate faster than rushing/
// receiving ones under most scoring formats, not because that QB is
// actually more valuable in a real 1-QB draft. Real Sleeper ADP already
// encodes real human drafters' positional-scarcity judgment that a raw
// point total can't see on its own, so blending it back in corrects that
// without reintroducing a market-value anchor that overrides points
// (confirmed live: with the blend, Gibbs/Robinson correctly land back in
// the top 10 and the deep-ADP QB drops to a realistic mid-board slot).
//
// FantasyCalc is deliberately NOT used anywhere in this file anymore
// (previously blended 50/50 with ADP) — the user's instruction is
// specifically points + ADP, not points + market trade value.
//
// DEF has no real ADP signal (Sleeper never assigns team defenses a
// searchRank) and no projection source of its own, so it's anchored the
// same way as before: real per-game production run through THIS league's
// own scoring, regressed toward the DEF positional average (one season of
// defensive stats is a genuinely noisy signal), then looked up on a real
// points→blended-score curve built from skill players who have both —
// recalibrated to the new points+ADP blended score instead of FantasyCalc
// value, so the whole board stays on one consistent scale.

import { prisma } from '@/lib/prisma';
import { INJURY_STATUS_RISK } from '@/lib/trade-engine';
import { calculateAge, isPlausiblyActivePlayer } from '@/lib/calculateAge';
import { computeRealPoints, blendTowardPositionAverage } from './leagueScoringPoints';
import { resolveProductionSignals } from './productionSignals';

// Multiplicative discount, not additive — scale-independent regardless of
// how high real season points run under a given league's scoring
// generosity. Same relative severity as the prior 0-100-scale version (an
// IR/Out player could lose up to 40% of a 100-point range there).
const REDRAFT_INJURY_MAX_DISCOUNT = 0.4;

const REDRAFT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

// Sleeper uses sentinel values for "unranked" rather than leaving
// searchRank null — 9999999 for fully unranked players, and a cluster of
// hundreds of distinct players all tied at exactly 999 (statistically
// impossible as a genuine continuous rank). Neither is a real distinct
// market position.
const SLEEPER_UNRANKED_SENTINEL = 999;

// A representative season length for converting DEF's per-game blended
// rate back to a season total comparable to skill players' own season
// totals — matches the games-played proxy used elsewhere in the League
// Scoring Points Engine.
const REPRESENTATIVE_SEASON_GAMES = 17;

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

export async function computeRealRedraftBoard(
    scoringSettings: Record<string, number>,
    superflex = false,
    limit = 300,
): Promise<RealRedraftPlayer[]> {
    const rawPlayers = await prisma.sleeperPlayer.findMany({
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
            depthChartOrder: true, yearsExp: true,
        },
    });

    // Real production signal per player: this season's real stats if any
    // games have been played, else this season's real full-season
    // projection, else last season's real stats as a final fallback. See
    // productionSignals.ts.
    const productionSignals = await resolveProductionSignals(rawPlayers.map(p => p.playerId));

    // Sleeper's active flag is unreliable for long-retired players still
    // marked active — a real computed-age cutoff catches what team!=FA alone
    // can miss, and a depth-chart+experience check catches the rarer case
    // where team AND birthDate are both stale (see feedback_stale_sleeper_player_data
    // and feedback_mock_draft_stale_rookie_pool for the Ben Roethlisberger case:
    // team frozen at 'PIT', birthDate off by ~5 years, age landing just under
    // the plausible cutoff too).
    const eligible = rawPlayers.filter(p => {
        if (!p.birthDate) return true; // team defenses — no birthDate, always fine
        const age = calculateAge(p.birthDate);
        return isPlausiblyActivePlayer({ team: p.team, age, depthChartOrder: p.depthChartOrder, yearsExp: p.yearsExp });
    });

    // ── Pass 1: real projected SEASON points under this league's own scoring ──
    type Pending = {
        p: (typeof eligible)[number];
        perGamePoints: number;
        seasonPoints: number;
        gamesPlayed: number | null;
        fromProjection: boolean;
    };
    const pending: Pending[] = eligible.map(p => {
        const signal = productionSignals.get(p.playerId);
        const perGamePoints = signal ? computeRealPoints(signal.statsPerGame, scoringSettings) : 0;
        const seasonPoints  = signal ? perGamePoints * signal.gamesPlayed : 0;
        return {
            p, perGamePoints, seasonPoints,
            gamesPlayed: signal?.gamesPlayed ?? null,
            fromProjection: signal?.fromProjection ?? false,
        };
    });

    // ── Real ADP → real season points calibration curve (skill positions) ──
    // Built from every skill player in this pool who has both a real
    // Sleeper ADP and real season points — the actual, observed shape of
    // how the market prices each draft slot in real point terms, not an
    // invented formula.
    const calibPoints: { adp: number; pts: number }[] = [];
    for (const { p, seasonPoints, gamesPlayed } of pending) {
        if (p.position === 'DEF' || !gamesPlayed) continue;
        if (p.searchRank == null || p.searchRank >= SLEEPER_UNRANKED_SENTINEL) continue;
        calibPoints.push({ adp: p.searchRank, pts: seasonPoints });
    }
    // A precise 2-point interpolation lets a single lucky/unlucky neighbor
    // swing the estimate wildly in noisy deep-ADP territory — averaging
    // over the nearest real neighborhood smooths that without fabricating
    // anything (same technique already proven for the DEF anchor below).
    const ADP_CALIB_WINDOW = 15;
    function estimatePointsFromAdp(adp: number): number {
        if (calibPoints.length === 0) return 0;
        const windowSize = Math.min(ADP_CALIB_WINDOW, calibPoints.length);
        const nearest = [...calibPoints]
            .sort((a, b) => Math.abs(a.adp - adp) - Math.abs(b.adp - adp))
            .slice(0, windowSize);
        return nearest.reduce((sum, c) => sum + c.pts, 0) / nearest.length;
    }

    // ── Blend: real season points + real ADP-implied season points ─────────
    const blendedPointsById = new Map<string, number>();
    for (const { p, seasonPoints } of pending) {
        if (p.position === 'DEF') continue; // DEF handled separately below
        const hasAdp = p.searchRank != null && p.searchRank < SLEEPER_UNRANKED_SENTINEL;
        const adpImplied = hasAdp ? estimatePointsFromAdp(p.searchRank!) : seasonPoints;
        blendedPointsById.set(p.playerId, (seasonPoints + adpImplied) / 2);
    }

    // ── DEF anchor: real production → comparable skill-player blended score ──
    // Neither Sleeper ADP nor a projection source covers team defenses, so
    // there's no direct market signal to calibrate against. Real per-game
    // production is regressed toward the DEF positional average first (one
    // season of defensive stats is a genuinely noisy, matchup-driven
    // signal — not as predictive as a full season of RB/WR opportunity
    // share), converted to a season-equivalent total, then looked up on a
    // real points→blended-score curve built from skill players who have
    // both — the value real skill players who score like that defense (on
    // the exact same real per-league scoring scale) actually land at.
    let defPosPtsSum = 0, defPosPtsCount = 0;
    for (const { p, perGamePoints, gamesPlayed } of pending) {
        if (p.position !== 'DEF' || !gamesPlayed) continue;
        defPosPtsSum += perGamePoints;
        defPosPtsCount++;
    }
    const defPosAvgPtsPerGame = defPosPtsCount > 0 ? defPosPtsSum / defPosPtsCount : 0;

    const pointsToBlendedCalib: { pts: number; blended: number }[] = [];
    for (const { p, seasonPoints } of pending) {
        if (p.position === 'DEF') continue;
        const blended = blendedPointsById.get(p.playerId);
        if (blended == null) continue;
        pointsToBlendedCalib.push({ pts: seasonPoints, blended });
    }
    const POINTS_CALIB_WINDOW = 15;
    function estimateBlendedFromPoints(pts: number): number {
        if (pointsToBlendedCalib.length === 0) return 0;
        const windowSize = Math.min(POINTS_CALIB_WINDOW, pointsToBlendedCalib.length);
        const nearest = [...pointsToBlendedCalib]
            .sort((a, b) => Math.abs(a.pts - pts) - Math.abs(b.pts - pts))
            .slice(0, windowSize);
        return nearest.reduce((sum, c) => sum + c.blended, 0) / nearest.length;
    }

    const defValueById = new Map<string, number>();
    for (const { p, perGamePoints, gamesPlayed } of pending) {
        if (p.position !== 'DEF') continue;
        const blendedPtsPerGame = gamesPlayed
            ? blendTowardPositionAverage(perGamePoints, defPosAvgPtsPerGame, gamesPlayed)
            : defPosAvgPtsPerGame;
        defValueById.set(p.playerId, estimateBlendedFromPoints(blendedPtsPerGame * REPRESENTATIVE_SEASON_GAMES));
    }

    // ── Pass 2: injury discount + final assembly ────────────────────────────
    const players = pending.map(({ p, perGamePoints, seasonPoints, gamesPlayed, fromProjection }) => {
        const pos = p.position ?? '';
        let finalValue = pos === 'DEF'
            ? (defValueById.get(p.playerId) ?? 0)
            : (blendedPointsById.get(p.playerId) ?? seasonPoints);

        // Current injury designation, applied on top of the points+ADP
        // base — real ADP often lags a very recent injury move, so a
        // player just placed on IR shouldn't keep riding a pre-injury
        // value in a current-season redraft ranking.
        const injuryRisk = INJURY_STATUS_RISK[p.injuryStatus ?? ''] ?? 0;
        finalValue = Math.max(0, finalValue * (1 - injuryRisk * REDRAFT_INJURY_MAX_DISCOUNT));

        return {
            playerId:        p.playerId,
            name:            p.fullName ?? '',
            position:        pos,
            team:            p.team,
            age:             p.age,
            birthDate:       p.birthDate,
            injuryStatus:    p.injuryStatus,
            adp:             p.searchRank ?? 999,
            realPtsPerGame:  gamesPlayed && !fromProjection ? perGamePoints : null,
            hasRealData:     Boolean(gamesPlayed) && !fromProjection,
            projPtsPerGame:  gamesPlayed && fromProjection ? perGamePoints : null,
            hasProjData:     Boolean(gamesPlayed) && fromProjection,
            depthChartOrder: p.depthChartOrder,
            finalValue,
        };
    });

    // A backup QB (not the confirmed current starter) has essentially no
    // standalone redraft value beyond handcuff insurance — they only see the
    // field if the real starter is hurt, so a real points+ADP blend alone
    // can't capture this (verified real case: a team's real backup QB
    // out-ranking an actual Week 1 starter elsewhere, purely off unproven
    // rookie-prospect hype the market hasn't discounted for zero real path
    // to snaps). No non-starting QB should ever rank above the worst real
    // starting QB — capped against that value directly (self-calibrating to
    // whatever this season's weakest real starter is actually worth) rather
    // than an arbitrary fixed number.
    const starterQbValues = players
        .filter(x => x.position === 'QB' && x.depthChartOrder === 1)
        .map(x => x.finalValue);
    if (starterQbValues.length > 0) {
        const worstStarterValue = Math.min(...starterQbValues);
        for (const x of players) {
            if (x.position === 'QB' && x.depthChartOrder !== 1) {
                x.finalValue = Math.min(x.finalValue, worstStarterValue - 1);
            }
        }
    }

    return players
        .sort((a, b) => b.finalValue - a.finalValue)
        .slice(0, limit)
        .map(({ finalValue: _finalValue, depthChartOrder: _depthChartOrder, ...rest }) => rest);
}
