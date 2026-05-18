// FantasyiQ Trust — League Phase Engine
// Fully dynamic: no hardcoded week numbers. Everything derives from league settings.

export type LeaguePhase =
    | 'PRE_DRAFT'       // after NFL season ends, before the rookie draft
    | 'OFFSEASON'       // after rookie draft, before Week 1
    | 'REGULAR_SEASON'  // Weeks 1 → (playoffWeekStart - 1)
    | 'PLAYOFFS'        // playoffWeekStart → (champWeek - 1)
    | 'CHAMPIONSHIP';   // champWeek

export interface LeaguePhaseInput {
    season:              string;    // e.g. "2026"
    currentWeek:         number;    // 0 = offseason before Week 1
    draftStatus:         string | null; // "complete" = rookie draft done
    playoffWeekStart:    number | null; // null = unknown
    champWeek:           number | null; // null = unknown
}

export interface LeaguePhaseResult {
    phase:            LeaguePhase;
    activeRookieYear: number;   // the "in-focus" rookie class year
    pickYears:        [number, number, number];
    useBucketedPicks: boolean;  // Early/Mid/Late vs. raw slot values
    isWinNowWindow:   boolean;  // regular season / playoffs / championship
    missingSettings:  boolean;  // true when playoffWeekStart or champWeek is unknown
    // Raw inputs echoed back for debug strip
    currentWeek:      number;
    playoffWeekStart: number | null;
    champWeek:        number | null;
}

// ── Championship week derivation ─────────────────────────────────────────────
// Derives champWeek from playoff start + playoff team count for Sleeper leagues.
// playoffTeams:
//   2 → 1 round  → champWeek = playoffWeekStart
//   4 → 2 rounds → champWeek = playoffWeekStart + 1
//   6 or 8 → 3 rounds → champWeek = playoffWeekStart + 2
export function deriveChampWeek(
    playoffWeekStart: number,
    playoffTeams: number,
    playoffRoundType = 0, // 0 = 1-week rounds, 1 = 2-week rounds
): number {
    const rounds =
        playoffTeams <= 2 ? 1 :
        playoffTeams <= 4 ? 2 : 3;
    const weeksPerRound = playoffRoundType === 1 ? 2 : 1;
    return playoffWeekStart + (rounds - 1) * weeksPerRound;
}

// ── Main phase resolver ───────────────────────────────────────────────────────
export function getLeaguePhaseResult(input: LeaguePhaseInput): LeaguePhaseResult {
    const {
        season,
        currentWeek,
        draftStatus,
        playoffWeekStart,
        champWeek,
    } = input;

    const seasonYear  = parseInt(season, 10) || new Date().getFullYear();
    const draftDone   = draftStatus === 'complete';
    const hasSettings = playoffWeekStart !== null && champWeek !== null;

    // Determine phase
    let phase: LeaguePhase;

    if (!draftDone && currentWeek === 0) {
        phase = 'PRE_DRAFT';
    } else if (draftDone && currentWeek === 0) {
        phase = 'OFFSEASON';
    } else if (hasSettings && currentWeek === champWeek!) {
        phase = 'CHAMPIONSHIP';
    } else if (hasSettings && currentWeek >= playoffWeekStart! && currentWeek < champWeek!) {
        phase = 'PLAYOFFS';
    } else if (currentWeek >= 1) {
        // If settings are missing we still know it's at least regular season
        if (hasSettings && currentWeek >= playoffWeekStart!) {
            // Shouldn't reach here but guard anyway
            phase = 'PLAYOFFS';
        } else {
            phase = 'REGULAR_SEASON';
        }
    } else {
        phase = 'OFFSEASON';
    }

    // Active rookie class:
    // PRE_DRAFT → current season's class (e.g. 2026 — draft hasn't happened yet)
    // everything else → NEXT season's class (draft done, focus shifts forward)
    const activeRookieYear = phase === 'PRE_DRAFT' ? seasonYear : seasonYear + 1;
    const pickYears: [number, number, number] = [activeRookieYear, activeRookieYear + 1, activeRookieYear + 2];

    const useBucketedPicks = phase !== 'PRE_DRAFT';
    const isWinNowWindow   = phase === 'REGULAR_SEASON' || phase === 'PLAYOFFS' || phase === 'CHAMPIONSHIP';

    return {
        phase,
        activeRookieYear,
        pickYears,
        useBucketedPicks,
        isWinNowWindow,
        missingSettings: !hasSettings,
        currentWeek,
        playoffWeekStart,
        champWeek,
    };
}

// ── Win-now weighting ─────────────────────────────────────────────────────────
// Applies a subtle +5% boost to current-year production values in win-now window.
// Only affects player values, not picks.
export function applyWinNowWeighting(value: number, isWinNowWindow: boolean): number {
    return isWinNowWindow ? Math.round(value * 1.05 * 10) / 10 : value;
}

// ── Pick bucket resolver ──────────────────────────────────────────────────────
// Given a team's standings rank and league size, returns Early/Mid/Late.
// Top third of standings = Late (good record → pick late in draft)
// Bottom third = Early (bad record → pick early)
export type PickBucket = 'Early' | 'Mid' | 'Late';

export function getPickBucket(rank: number, leagueSize: number): PickBucket {
    if (leagueSize <= 0) return 'Mid';
    const pct = rank / leagueSize;
    if (pct <= 1 / 3) return 'Late';   // top third → late picks
    if (pct <= 2 / 3) return 'Mid';
    return 'Early';                    // bottom third → early picks
}

// ── Phase label for UI ────────────────────────────────────────────────────────
export function phaseLabel(phase: LeaguePhase): string {
    switch (phase) {
        case 'PRE_DRAFT':      return 'Pre-Draft';
        case 'OFFSEASON':      return 'Offseason';
        case 'REGULAR_SEASON': return 'Regular Season';
        case 'PLAYOFFS':       return 'Playoffs';
        case 'CHAMPIONSHIP':   return 'Championship';
    }
}
