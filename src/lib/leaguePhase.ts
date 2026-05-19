// FantasyiQ Trust — League Phase Engine v3.5
// Fully dynamic: no hardcoded week numbers. Everything derives from league settings.
// v3.5: nullable currentWeek, explicit fallback defaults, cleaner guard ordering.

export type LeaguePhase =
    | 'PRE_DRAFT'       // after NFL season ends, before the rookie draft
    | 'OFFSEASON'       // after rookie draft, before Week 1
    | 'REGULAR_SEASON'  // Weeks 1 → (playoffWeekStart - 1)
    | 'PLAYOFFS'        // playoffWeekStart → (champWeek - 1)
    | 'CHAMPIONSHIP';   // champWeek

export interface LeaguePhaseInput {
    season:              string;          // e.g. "2026"
    currentWeek:         number | null;   // null = pre-schedule / pre-season; 0 = same
    draftStatus:         string | null;   // "complete" = rookie draft done
    playoffWeekStart:    number | null;   // null = unknown / not configured
    champWeek:           number | null;   // null = unknown / not configured
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

// ── Main phase resolver v3.5 ─────────────────────────────────────────────────
export function getLeaguePhaseResult(input: LeaguePhaseInput): LeaguePhaseResult {
    const {
        season,
        draftStatus,
        playoffWeekStart,
        champWeek,
    } = input;

    // Normalise currentWeek: null and 0 both mean "pre-season / no schedule yet"
    const currentWeek = input.currentWeek ?? 0;

    const seasonYear  = parseInt(season, 10) || new Date().getFullYear();
    const draftDone   = draftStatus === 'complete';
    const hasSettings = playoffWeekStart !== null && champWeek !== null;

    // Determine phase
    let phase: LeaguePhase;

    // Guard 1: no schedule yet (null or week 0)
    if (currentWeek === 0) {
        phase = draftDone ? 'OFFSEASON' : 'PRE_DRAFT';
    }
    // Guard 2: draft not complete — still pre-draft regardless of week
    else if (!draftDone) {
        phase = 'PRE_DRAFT';
    }
    // Guard 3: settings present — use configured playoff weeks
    else if (hasSettings) {
        if (currentWeek >= champWeek!)                              phase = 'CHAMPIONSHIP';
        else if (currentWeek >= playoffWeekStart!)                  phase = 'PLAYOFFS';
        else                                                         phase = 'REGULAR_SEASON';
    }
    // Guard 4: settings missing — fall back to well-known NFL defaults
    else {
        if (currentWeek >= 15)       phase = 'CHAMPIONSHIP';
        else if (currentWeek === 14) phase = 'PLAYOFFS';
        else if (currentWeek >= 1)   phase = 'REGULAR_SEASON';
        else                         phase = 'OFFSEASON';
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
