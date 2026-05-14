// FantasyIQ Trust — Defensive & Kicker Ranking Engine
// Types shared between the projection builder and the ranking engine.

// ── League configuration ───────────────────────────────────────────────────────

export type LeagueScoring = {
    idp: {
        soloTackle:       number;
        assist:           number;
        sack:             number;
        tfl:              number;
        interception:     number;
        forcedFumble:     number;
        fumbleRecovery:   number;
        passDefended:     number;
        defensiveTd:      number;
        safety:           number;
        qbHit?:           number;
    };
    kicker: {
        fg_0_39:   number;
        fg_40_49:  number;
        fg_50_plus: number;
        xp:        number;
        missedFg:  number;
        missedXp:  number;
    };
    defense: {
        sack:             number;
        interception:     number;
        fumbleRecovery:   number;
        defensiveTd:      number;
        safety:           number;
        returnTd:         number;
        /** Ordered array of point buckets; engine picks the matching bucket by maxPoints. */
        pointsAllowedBuckets: { maxPoints: number; points: number }[];
    };
};

export type LeagueLineup = {
    teams:    number;
    starters: {
        DL:  number;
        LB:  number;
        DB:  number;
        IDP: number; // flex IDP slot
        K:   number;
        DEF: number; // team defense / DST
    };
    benchSize: number;
};

// ── Projection types (inputs to the ranking engine) ───────────────────────────

export type IdpProjection = {
    playerId:          string;
    position:          'DL' | 'LB' | 'DB';
    age?:              number;
    soloTackles:       number;
    assists:           number;
    sacks:             number;
    tfl:               number;
    interceptions:     number;
    forcedFumbles:     number;
    fumbleRecoveries:  number;
    passesDefended:    number;
    defensiveTds:      number;
    safeties:          number;
    qbHits?:           number;
    floorMultiplier?:  number;
    ceilingMultiplier?: number;
};

export type KickerProjection = {
    playerId:          string;
    fg_0_39:           number;
    fg_40_49:          number;
    fg_50_plus:        number;
    xp:                number;
    missedFg:          number;
    missedXp:          number;
    floorMultiplier?:  number;
    ceilingMultiplier?: number;
};

export type DefenseProjection = {
    teamId:            string;
    sacks:             number;
    interceptions:     number;
    fumbleRecoveries:  number;
    defensiveTds:      number;
    safeties:          number;
    returnTds:         number;
    /** Probability distribution over scoring buckets; probabilities should sum to ~1. */
    pointsAllowedDistribution: { maxPoints: number; probability: number }[];
    floorMultiplier?:  number;
    ceilingMultiplier?: number;
};

// ── Output types ───────────────────────────────────────────────────────────────

export type RankedEntity = {
    id:              string;
    position:        'DL' | 'LB' | 'DB' | 'IDP' | 'K' | 'DEF';
    projectedPoints: number;
    floor:           number;
    ceiling:         number;
    volatility:      number;
    scarcityFactor:  number;
    valueScore:      number;  // 0–100
    rank:            number;  // within position group
    overallRank?:    number;  // across all defensive positions when IDP is enabled
};

export type RankingResult = {
    idpEnabled:      boolean;
    kickerEnabled:   boolean;
    defenseEnabled:  boolean;
    idp:             RankedEntity[];
    kickers:         RankedEntity[];
    defenses:        RankedEntity[];
};

// ── Raw input types for the projection builder ────────────────────────────────

/** One player's 2025 season stats for IDP. */
export type RawIdpStats = {
    playerId:          string;
    position:          'DL' | 'LB' | 'DB';
    age?:              number;
    gamesPlayed:       number;
    soloTackles:       number;
    assists:           number;
    sacks:             number;
    tfl:               number;
    interceptions:     number;
    forcedFumbles:     number;
    fumbleRecoveries:  number;
    passesDefended:    number;
    defensiveTds:      number;
    safeties:          number;
    qbHits?:           number;
    /** Optional per-game variance for each stat (used to derive floor/ceiling). */
    statVariance?:     Partial<Record<string, number>>;
};

/** One player's 2025 season stats for kickers. */
export type RawKickerStats = {
    playerId:    string;
    gamesPlayed: number;
    fg_0_39:     number;
    fg_40_49:    number;
    fg_50_plus:  number;
    xp:          number;
    missedFg:    number;
    missedXp:    number;
    statVariance?: Partial<Record<string, number>>;
};

/** One team's 2025 season stats for DEF/ST. */
export type RawDefenseStats = {
    teamId:           string;
    gamesPlayed:      number;
    sacks:            number;
    interceptions:    number;
    fumbleRecoveries: number;
    defensiveTds:     number;
    safeties:         number;
    returnTds:        number;
    /** Array of game-level points-allowed values (used to build distribution). */
    pointsAllowedPerGame: number[];
    statVariance?:    Partial<Record<string, number>>;
};

/** Sleeper 2026 ADP entry. */
export type SleeperAdpEntry = {
    id:       string; // playerId or teamId
    position: 'DL' | 'LB' | 'DB' | 'K' | 'DEF';
    adp:      number; // overall pick number; lower = better
};
