// FantasyiQ Trust — Team Trajectory Engine v2
// League-relative: all scores contextualized against the full league,
// not absolute thresholds.

import type {
    LeagueContext, TeamContext, TeamTrajectory,
    TrajectoryMode, WinCurve, TrajectoryDirection,
} from './types';
import { computePickCapitalScores } from './pickCapital';

function deriveMode(overall: number, age: number, pickCapital: number): TrajectoryMode {
    if (overall >= 75 && age >= 55)               return 'CONTENDER';
    if (overall >= 65 && pickCapital >= 70)        return 'ASCENDING';
    if (overall <= 40 && pickCapital >= 80)        return 'REBUILDER';
    if (overall <= 45 && age <= 45 && pickCapital <= 50) return 'DECLINING';
    return 'STUCK';
}

function deriveWinCurve(age: number, pickCapital: number): WinCurve {
    // age: higher = younger / better curve
    if (age >= 70 && pickCapital <= 50) return 'PEAKING_NOW';  // young, no picks to trade → window is now
    if (age >= 60 && pickCapital >= 60) return 'PEAK_AHEAD';   // young + picks → ascending toward peak
    if (age <= 45 && pickCapital <= 40) return 'FALLING';       // old, no capital → declining
    return 'FLAT';
}

function deriveDirection(
    mode: TrajectoryMode,
    phaseIsWinNow: boolean,
    pickCapital: number,
    futureVsProduction: number,
): TrajectoryDirection {
    if (mode === 'CONTENDER' && phaseIsWinNow)              return 'BUY_PRODUCTION';
    // Rebuilder always has high picks (by definition) — deploy them for proven production
    if (mode === 'REBUILDER' || (pickCapital >= 80 && futureVsProduction >= 65)) return 'BUY_PRODUCTION';
    if (mode === 'DECLINING' || (futureVsProduction <= 40 && pickCapital <= 40)) return 'BUY_PICKS';
    if (mode === 'ASCENDING' && pickCapital >= 70)           return 'HOLD';
    return 'SELL_PRODUCTION';
}

export function computeTeamTrajectoryForLeague(
    league: LeagueContext,
): Map<string, TeamTrajectory> {
    const pickCapitalScores = computePickCapitalScores(league);
    const result            = new Map<string, TeamTrajectory>();

    for (const team of league.teams) {
        const starterQuality     = team.startersScore;
        const rosterAge          = team.ageCurveScore;           // 0–100, higher = younger
        const futureVsProduction = team.futureVsProductionScore; // 0–100, higher = more future
        const pickCapital        = pickCapitalScores.get(team.id) ?? 50;

        const overall = Math.round(
            starterQuality     * 0.35 +
            rosterAge          * 0.20 +
            pickCapital        * 0.25 +
            futureVsProduction * 0.20
        );

        const mode               = deriveMode(overall, rosterAge, pickCapital);
        const winCurve           = deriveWinCurve(rosterAge, pickCapital);
        const recommendedDirection = deriveDirection(
            mode,
            league.phase.isWinNowWindow,
            pickCapital,
            futureVsProduction,
        );

        result.set(team.id, {
            mode,
            winCurve,
            overallScore:       overall,
            starterQuality:     Math.round(starterQuality),
            rosterAge:          Math.round(rosterAge),
            pickCapital:        Math.round(pickCapital),
            futureVsProduction: Math.round(futureVsProduction),
            recommendedDirection,
        });
    }

    return result;
}
