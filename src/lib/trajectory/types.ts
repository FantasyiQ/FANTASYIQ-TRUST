// FantasyiQ Trust — Team Trajectory Engine v2 — Core Types

export type TrajectoryMode =
    | 'CONTENDER'
    | 'ASCENDING'
    | 'STUCK'
    | 'DECLINING'
    | 'REBUILDER';

export type WinCurve = 'PEAKING_NOW' | 'PEAK_AHEAD' | 'FLAT' | 'FALLING';

export type TrajectoryDirection =
    | 'BUY_PRODUCTION'
    | 'BUY_PICKS'
    | 'HOLD'
    | 'SELL_PRODUCTION';

export interface TeamTrajectory {
    mode:                 TrajectoryMode;
    winCurve:             WinCurve;
    overallScore:         number;  // 0–100 weighted composite
    starterQuality:       number;  // 0–100
    rosterAge:            number;  // 0–100 (higher = younger / better age curve)
    pickCapital:          number;  // 0–100 league-relative pick capital score
    futureVsProduction:   number;  // 0–100 (higher = more future-weighted)
    recommendedDirection: TrajectoryDirection;
}

/** Slim phase context used inside the trajectory engine — a subset of LeaguePhaseResult. */
export interface LeaguePhaseContext {
    phase:            string;
    isWinNowWindow:   boolean;
    activeRookieYear: number;
}

export interface TeamPick {
    round: number;  // 1, 2, 3, 4…
    year:  number;  // 2026, 2027, …
}

export interface TeamContext {
    id:                      string;  // String(roster_id)
    startersScore:           number;  // 0–100
    ageCurveScore:           number;  // 0–100 (higher = younger / better)
    futureVsProductionScore: number;  // 0–100 (higher = more future)
    picks:                   TeamPick[];
}

export interface LeagueContext {
    teams: TeamContext[];
    phase: LeaguePhaseContext;
}
