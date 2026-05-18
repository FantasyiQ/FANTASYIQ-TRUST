// FantasyiQ Trust — Pick Capital Scorer
// Computes league-relative pick capital scores (0–100), anchored to the league
// average so a team at average sits at 100 and below-average scales down.

import type { LeagueContext, TeamContext, TeamPick } from './types';

function getRoundWeight(round: number): number {
    if (round === 1) return 1.00;
    if (round === 2) return 0.45;
    if (round === 3) return 0.15;
    return 0.05;  // 4th+
}

function getYearWeight(pickYear: number, activeRookieYear: number): number {
    const diff = pickYear - activeRookieYear;
    if (diff <= 0) return 1.00;  // current class
    if (diff === 1) return 0.95;
    if (diff === 2) return 0.85;
    if (diff === 3) return 0.70;
    return 0.40;                 // 4+ years out
}

function countExtraFirsts(picks: TeamPick[], activeRookieYear: number): number {
    const firstsNext3 = picks.filter(
        p => p.round === 1 && p.year <= activeRookieYear + 2
    ).length;
    // Baseline = 1 first per year for the next 3 seasons
    return Math.max(0, firstsNext3 - 3);
}

function computeRawPickCapital(team: TeamContext, activeRookieYear: number): number {
    const base = team.picks.reduce((sum, pick) => {
        return sum + getRoundWeight(pick.round) * getYearWeight(pick.year, activeRookieYear);
    }, 0);

    const extraFirsts = countExtraFirsts(team.picks, activeRookieYear);
    // +25% per extra first-round pick in the next 3 years
    const multiplier = 1 + extraFirsts * 0.25;

    return base * multiplier;
}

export function computePickCapitalScores(league: LeagueContext): Map<string, number> {
    const { phase, teams } = league;
    const activeRookieYear = phase.activeRookieYear;

    const rawByTeam = new Map<string, number>();
    for (const team of teams) {
        rawByTeam.set(team.id, computeRawPickCapital(team, activeRookieYear));
    }

    const values   = Array.from(rawByTeam.values());
    const leagueAvg = values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;

    const scores = new Map<string, number>();
    for (const team of teams) {
        const raw = rawByTeam.get(team.id) ?? 0;
        if (leagueAvg <= 0) {
            scores.set(team.id, 50);
        } else {
            const ratio   = (raw / leagueAvg) * 100;
            const clamped = Math.max(0, Math.min(100, ratio));
            scores.set(team.id, Math.round(clamped));
        }
    }

    return scores;
}
