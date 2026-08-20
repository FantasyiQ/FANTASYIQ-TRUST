// FantasyIQ Trust — Real Redraft Big Board
//
// Ranks players for a specific league's redraft board by real Value Over
// Replacement (VOR) — a blended "real value" per player minus the real
// replacement-level value at that player's position.
//
// QB/RB/WR/TE real value = 0.67 * real projected season points (under
// this league's exact scoring settings) + 0.33 * ADP-implied season
// points (real, format-specific market ADP looked up on a real
// points-vs-ADP calibration curve, smoothed over its nearest real
// neighbors). K/DEF are deliberately excluded from this blend — instead
// their real per-game production is regressed toward their own real
// positional average first (one season of kicking or defensive stats is
// a genuinely noisy, matchup-driven signal), since an unregressed
// single-player point estimate at either position can create an outsized
// VOR spike no real drafter would act on.
//
// Why not raw points alone: verified live that raw season points puts 14
// of the top 15 players at QB, because QBs touch the ball on every
// offensive snap and passing production accumulates faster than rushing/
// receiving under most scoring formats — a real fact about the sport, not
// a bug. Positional scarcity (only one starting QB vs. deep RB/WR bench
// demand) is captured by VOR/replacement level, not by this blend — the
// blend's job is narrower: keep points as the primary signal while
// letting real market ADP pull back a player whose raw point total
// doesn't reflect how real drafters actually value them (e.g. a
// scrambling QB whose real ADP runs well ahead of a pure-passer with a
// similar point total).
//
// Why replacement level can't be "starters + FLEX" alone: verified live —
// that produced kickers ranking in round 2, because a starters-only model
// has no way to know that real drafters extensively bench-stash RB/WR
// (handcuffs, breakout bets, bye-week insurance) but essentially never
// bench-stash K/DEF (always freely available on waivers). Bench
// utilization is a behavioral property of the drafter population, not a
// mathematical property of the roster — you can't derive it from roster
// size alone, but real ADP already measures it directly: how deep a
// position gets drafted, in practice, before a real team's whole roster
// fills up. So replacement level is computed as: take this league's total
// real draftable roster spots (teams × non-IR roster slots), walk down
// the real ADP-sorted list that many players deep, and count how many of
// each position actually appear in that realistically-drafted slice —
// that count IS the replacement index for that position. RB/WR naturally
// come out deep (real bench-stash behavior), K/DEF naturally come out
// shallow (real streaming behavior) — no positional heuristics, no
// assumed FLEX split, just what real ADP shows actually happens.
//
// DEF has no real ADP source at all (Sleeper never assigns one), so it
// falls back to a starters-only replacement index (teams × real DEF
// starter slots) — the one position where "no bench stashing" is true by
// definition regardless of what ADP would show if it existed.
//
// Real, format-specific ADP (matched to this league's actual superflex/
// PPR settings, not Sleeper's superflex-skewed generic searchRank — see
// feedback_searchrank_superflex_skew) both drives the replacement-level
// calculation above AND breaks a genuine VOR tie — never blended directly
// into a player's own ranking value.
//
// Positional stability/fragility multiplier: applied as a flat scaling
// factor on top of the fully-computed VOR — QB +12.5%, WR +7.5%, RB
// -12.5%, TE -7.5%, K/DEF unchanged. This is an explicit, requested
// override, not a measured signal — real week-to-week bust/consistency
// data isn't what's driving these numbers. It moves QB/WR up and RB/TE
// down relative to raw VOR without touching replacement level, ADP depth,
// or the points+ADP blend underneath. Verified live it narrows but does
// not fully close the gap to the RB-heavy top of the board — the top
// RBs' raw VOR lead is large enough that even the requested range's
// maximum can't put a QB in the top 5 of a standard league; see
// feedback_vor_redraft_design for the exact numbers checked.
//
// FantasyCalc is not used anywhere in this file.

import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import { INJURY_STATUS_RISK } from '@/lib/trade-engine';
import { calculateAge, isPlausiblyActivePlayer } from '@/lib/calculateAge';
import { computeRealPoints, blendTowardPositionAverage } from './leagueScoringPoints';
import { resolveProductionSignals } from './productionSignals';

// Multiplicative discount, not additive — scale-independent regardless of
// how high real season points run under a given league's scoring
// generosity. An IR/Out player can lose up to 40% of their real projected
// season points.
const REDRAFT_INJURY_MAX_DISCOUNT = 0.4;

const REDRAFT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
type RedraftPosition = (typeof REDRAFT_POSITIONS)[number];

// Sleeper uses sentinel values for "unranked" rather than leaving
// searchRank/adp_* null — 9999999 or 999+ for fully unranked players.
// Neither is a real distinct market position.
const SLEEPER_UNRANKED_SENTINEL = 999;

// A representative season length for converting DEF's per-game blended
// rate back to a season total comparable to skill players' own season
// totals — matches the games-played proxy used elsewhere in the League
// Scoring Points Engine.
const REPRESENTATIVE_SEASON_GAMES = 17;

// Positional stability/fragility smoothing — applied as a flat multiplier
// on top of the already-computed VOR (never touching replacement level,
// the ADP-depth calculation, or the points+ADP blend that feeds VOR).
// Not derived from a measured signal — a deliberate, explicit override
// requested to counteract how thin real replacement level makes RB/TE
// look and how deep it makes QB/WR look, independent of true week-to-week
// bust/stability risk. Midpoint of each requested range: QB +12.5%
// (stability), WR +7.5% (consistency), RB -12.5% (fragility), TE -7.5%
// (volatility), K/DEF unchanged (streaming positions).
const POSITION_STABILITY_MULTIPLIER: Record<RedraftPosition, number> = {
    QB: 1.125,
    RB: 0.875,
    WR: 1.075,
    TE: 0.925,
    K:  1,
    DEF: 1,
};

export interface RealRedraftPlayer {
    playerId:       string;
    name:           string;
    position:       string;
    team:           string | null;
    age:            number | null;
    birthDate:      string | null;
    injuryStatus:   string | null;
    adp:            number;              // real, format-specific market ADP — tiebreaker only, shown for reference
    realPtsPerGame: number | null;        // null when the player has no season stats yet
    hasRealData:    boolean;
    projPtsPerGame: number | null;        // real projected points — only set when hasRealData is false
    hasProjData:    boolean;
}

// Real DEF starter slots for this league — DEF has no real ADP source, so
// its replacement index falls back to starters-only (no assumed roster,
// parsed from the league's actual rosterPositions array).
function countRealDefStarterSlots(rosterPositions: string[]): number {
    return rosterPositions.filter(slot => slot === 'DEF').length;
}

export async function computeRealRedraftBoard(
    scoringSettings: Record<string, number>,
    rosterPositions: string[],
    totalTeams: number,
    limit = 300,
): Promise<RealRedraftPlayer[]> {
    const superflex = rosterPositions.includes('SUPER_FLEX');

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

    // Real, FORMAT-SPECIFIC ADP — SleeperPlayer.searchRank is a single
    // generic rank that tracks superflex/2QB draft behavior almost exactly
    // regardless of a league's real format (verified live: a real QB's
    // searchRank landed within ~1 pick of his own adp_2qb, while his real
    // adp_std — the actual standard 1-QB number — was 5x later). Sleeper's
    // own season projection payload carries real format-specific ADP
    // fields (adp_std / adp_half_ppr / adp_ppr / adp_2qb) for the same
    // players — select the one matching THIS league's real format instead.
    const currentSeason = (await getNflState()).season;
    const seasonProjRows = await prisma.playerSeasonProjection.findMany({
        where:  { season: currentSeason },
        select: { playerId: true, rawStats: true },
    });
    const receptionPoints = scoringSettings.rec ?? 0;
    function pickFormatAdp(rawStats: unknown): number | null {
        const raw = rawStats as Record<string, number> | null;
        if (!raw) return null;
        const val = superflex
            ? raw.adp_2qb
            : receptionPoints >= 0.75 ? raw.adp_ppr
            : receptionPoints >= 0.25 ? raw.adp_half_ppr
            : raw.adp_std;
        return val != null && val < SLEEPER_UNRANKED_SENTINEL ? val : null;
    }
    const formatAdpById = new Map<string, number>();
    for (const r of seasonProjRows) {
        const adp = pickFormatAdp(r.rawStats);
        if (adp != null) formatAdpById.set(r.playerId, adp);
    }
    function resolveAdp(p: { playerId: string; searchRank: number | null }): number | null {
        const formatAdp = formatAdpById.get(p.playerId);
        if (formatAdp != null) return formatAdp;
        return p.searchRank != null && p.searchRank < SLEEPER_UNRANKED_SENTINEL ? p.searchRank : null;
    }

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

    // ── Real projected SEASON points under this league's own scoring ───────
    type Pending = {
        p: (typeof eligible)[number];
        adp: number | null;
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
            p, adp: resolveAdp(p), perGamePoints, seasonPoints,
            gamesPlayed: signal?.gamesPlayed ?? null,
            fromProjection: signal?.fromProjection ?? false,
        };
    });

    // ── Real ADP → real season points calibration curve (skill positions) ──
    // Built from every non-DEF/K player in this pool who has both a real
    // format-specific ADP and real season points — the actual, observed
    // shape of how the market prices each draft slot in real point terms,
    // not an invented formula. A precise 2-point interpolation lets a
    // single lucky/unlucky neighbor swing the estimate wildly in noisy
    // deep-ADP territory — averaging over the nearest real neighborhood
    // smooths that without fabricating anything.
    const calibPoints: { adp: number; pts: number }[] = [];
    for (const { p, adp, seasonPoints, gamesPlayed } of pending) {
        if (p.position === 'DEF' || !gamesPlayed || adp == null) continue;
        calibPoints.push({ adp, pts: seasonPoints });
    }
    const ADP_CALIB_WINDOW = 15;
    function estimatePointsFromAdp(adp: number): number {
        if (calibPoints.length === 0) return 0;
        const windowSize = Math.min(ADP_CALIB_WINDOW, calibPoints.length);
        const nearest = [...calibPoints]
            .sort((a, b) => Math.abs(a.adp - adp) - Math.abs(b.adp - adp))
            .slice(0, windowSize);
        return nearest.reduce((sum, c) => sum + c.pts, 0) / nearest.length;
    }

    // ── Blend: 0.67 real season points + 0.33 ADP-implied season points ────
    // QB/RB/WR/TE only. K/DEF keep pure real points — see file header.
    const blendedScoreById = new Map<string, number>();
    for (const { p, adp, seasonPoints } of pending) {
        if (p.position === 'DEF' || p.position === 'K') continue;
        const adpImplied = adp != null ? estimatePointsFromAdp(adp) : seasonPoints;
        blendedScoreById.set(p.playerId, 0.67 * seasonPoints + 0.33 * adpImplied);
    }

    // ── DEF & K: real production → real season points, regressed toward ────
    // each position's own real average — no ADP-blend signal for either
    // (see the points+ADP blend above). One season of defensive OR
    // kicking stats is a genuinely noisy, matchup-driven signal (not as
    // predictive as a full season of RB/WR opportunity share) — real
    // per-game production is regressed toward that position's own real
    // average first, then converted to a season total on the exact same
    // real-points scale as every skill player. Applied identically to K
    // as to DEF: an unregressed single-kicker point estimate can create
    // an outsized apparent VOR spike no real drafter would act on (verified
    // live: a K with a modestly favorable real projection ranked #67
    // overall pre-fix), the same failure mode this regression already
    // fixes for DEF.
    function computePosAvgPtsPerGame(pos: RedraftPosition): number {
        let sum = 0, count = 0;
        for (const { p, perGamePoints, gamesPlayed } of pending) {
            if (p.position !== pos || !gamesPlayed) continue;
            sum += perGamePoints;
            count++;
        }
        return count > 0 ? sum / count : 0;
    }
    const defPosAvgPtsPerGame = computePosAvgPtsPerGame('DEF');
    const kPosAvgPtsPerGame   = computePosAvgPtsPerGame('K');

    // Final real value per player (injury-discounted) — this is what VOR
    // gets computed against. QB/RB/WR/TE: the 0.67/0.33 points+ADP blend
    // above. DEF: real points regressed toward the DEF positional average.
    // K: same regression, but only for the confirmed real depth-chart
    // starter (depthChartOrder === 1) — a backup/camp-competition kicker
    // has no standalone redraft value, same principle as the backup-QB cap
    // below, applied at the source. Real drafters never roster a backup
    // kicker; forcing finalPoints to 0 guarantees VOR <= 0, dropping them
    // out of the draftable range instead of tying them to the position
    // average alongside real starters (verified live: an unrostered-role K
    // with zero real signal was ranking ahead of real starters with actual,
    // if modest, real production).
    type Scored = Pending & { finalPoints: number };
    const scored: Scored[] = pending.map(entry => {
        const { p, perGamePoints, seasonPoints, gamesPlayed } = entry;
        let finalPoints = blendedScoreById.get(p.playerId) ?? seasonPoints;
        if (p.position === 'DEF') {
            const blendedPtsPerGame = gamesPlayed
                ? blendTowardPositionAverage(perGamePoints, defPosAvgPtsPerGame, gamesPlayed)
                : defPosAvgPtsPerGame;
            finalPoints = blendedPtsPerGame * REPRESENTATIVE_SEASON_GAMES;
        } else if (p.position === 'K') {
            if (p.depthChartOrder !== 1) {
                finalPoints = 0;
            } else {
                const blendedPtsPerGame = gamesPlayed
                    ? blendTowardPositionAverage(perGamePoints, kPosAvgPtsPerGame, gamesPlayed)
                    : kPosAvgPtsPerGame;
                finalPoints = blendedPtsPerGame * REPRESENTATIVE_SEASON_GAMES;
            }
        }
        const injuryRisk = INJURY_STATUS_RISK[p.injuryStatus ?? ''] ?? 0;
        finalPoints = Math.max(0, finalPoints * (1 - injuryRisk * REDRAFT_INJURY_MAX_DISCOUNT));
        return { ...entry, finalPoints };
    });

    // ── Value Over Replacement: real ADP depth → replacement level ─────────
    // Real ADP measures actual drafter bench-stash behavior — walk down
    // this league's own real ADP-sorted list exactly as many players as
    // this league's real total draftable roster spots (teams × non-IR
    // roster slots), and count how many of each position actually appear
    // in that realistically-drafted slice. That count is the position's
    // replacement index: RB/WR come out deep (real handcuff/bench-stash
    // demand), K/DEF come out shallow (real streaming behavior) — no
    // assumed FLEX split, no positional heuristics, just what this
    // league's real ADP shows actually happens.
    const draftableSlotsPerTeam = rosterPositions.filter(slot => slot !== 'IR').length;
    const totalDraftedPlayers   = totalTeams * draftableSlotsPerTeam;

    const adpSorted = scored
        .filter(x => x.p.position !== 'DEF' && x.adp != null) // DEF has no real ADP source — handled separately below
        .sort((a, b) => a.adp! - b.adp!)
        .slice(0, totalDraftedPlayers);

    const replacementIndex: Record<RedraftPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    for (const x of adpSorted) replacementIndex[x.p.position as RedraftPosition]++;
    // DEF: no real ADP source exists at all (Sleeper never assigns team
    // defenses one), so it falls back to starters-only — the one position
    // where "no bench stashing" is true by definition, not an assumption.
    replacementIndex.DEF = totalTeams * countRealDefStarterSlots(rosterPositions);

    const sortedByPos: Record<RedraftPosition, number[]> = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
    for (const pos of REDRAFT_POSITIONS) {
        sortedByPos[pos] = scored
            .filter(x => x.p.position === pos)
            .map(x => x.finalPoints)
            .sort((a, b) => b - a);
    }

    const replacementPoints: Record<RedraftPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    for (const pos of REDRAFT_POSITIONS) {
        const list = sortedByPos[pos];
        const idx  = Math.min(replacementIndex[pos], list.length - 1);
        replacementPoints[pos] = idx >= 0 ? list[idx] : 0;
    }

    // ── Final assembly: VOR, ADP as tiebreak only ───────────────────────────
    const players = scored.map(({ p, adp, perGamePoints, gamesPlayed, fromProjection, finalPoints }) => {
        const pos = (p.position ?? '') as RedraftPosition;
        const vor = (finalPoints - (replacementPoints[pos] ?? 0)) * (POSITION_STABILITY_MULTIPLIER[pos] ?? 1);

        return {
            playerId:        p.playerId,
            name:            p.fullName ?? '',
            position:        pos,
            team:            p.team,
            age:             p.age,
            birthDate:       p.birthDate,
            injuryStatus:    p.injuryStatus,
            // Real, format-specific ADP where available (tiebreaker only —
            // never moves a player above/below another with a clearly
            // different VOR); falls back to the generic searchRank only
            // for the rare player with neither.
            adp:             adp ?? p.searchRank ?? 999,
            realPtsPerGame:  gamesPlayed && !fromProjection ? perGamePoints : null,
            hasRealData:     Boolean(gamesPlayed) && !fromProjection,
            projPtsPerGame:  gamesPlayed && fromProjection ? perGamePoints : null,
            hasProjData:     Boolean(gamesPlayed) && fromProjection,
            depthChartOrder: p.depthChartOrder,
            vor,
        };
    });

    // A backup QB (not the confirmed current starter) has essentially no
    // standalone redraft value beyond handcuff insurance — they only see
    // the field if the real starter is hurt. VOR alone can still be
    // fooled by a highly-touted backup's real season projection assuming
    // more playing time than they'll realistically get, so no non-starting
    // QB should ever rank above the worst real starting QB — capped
    // against that VOR directly (self-calibrating to whatever this
    // season's weakest real starter is actually worth) rather than an
    // arbitrary fixed number.
    const starterQbVor = players
        .filter(x => x.position === 'QB' && x.depthChartOrder === 1)
        .map(x => x.vor);
    if (starterQbVor.length > 0) {
        const worstStarterVor = Math.min(...starterQbVor);
        for (const x of players) {
            if (x.position === 'QB' && x.depthChartOrder !== 1) {
                x.vor = Math.min(x.vor, worstStarterVor - 1);
            }
        }
    }

    // VOR first, full stop — ADP only breaks a real tie (rounded to the
    // nearest whole point, since exact floating-point equality is rare but
    // two players "effectively tied" on VOR is common).
    return players
        .sort((a, b) => {
            const byVor = Math.round(b.vor) - Math.round(a.vor);
            if (byVor !== 0) return byVor;
            return a.adp - b.adp; // lower (better) real ADP wins ties
        })
        .slice(0, limit)
        .map(({ depthChartOrder: _depthChartOrder, ...rest }) => rest);
}
