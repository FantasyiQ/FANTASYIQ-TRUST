// FantasyiQ Trust — Live Draft Assistant — Core Types

export type DraftType        = 'rookie' | 'startup';
export type TeamMode         = 'WIN_NOW' | 'BALANCED' | 'REBUILD';
export type TrajectoryWindow = 'WIN_NOW' | 'ASCENDING' | 'PLATEAU' | 'REBUILD';
export type HorizonYears     = 1 | 2 | 3;
export type RiskTolerance    = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Combined read model used by the scoring engine.
 * teamMode = current roster snapshot (age curve, starter quality, positional stability).
 * trajectoryWindow = forward-looking window from TrajectoryiQ (winCurve + mode).
 * The two signals are reconciled inside the scoring engine — they are intentionally
 * kept separate here so the reconciliation rules can be reasoned about explicitly.
 */
export interface DraftProfile {
    teamMode:         TeamMode;
    trajectoryWindow: TrajectoryWindow;
    horizonYears:     HorizonYears;
    riskTolerance:    RiskTolerance;
}

/**
 * Derives a single plain-English trajectory label from teamMode + trajectoryWindow.
 * Used everywhere labels are shown to the user — replaces raw BALANCED/PLATEAU strings.
 *
 * All-In     → WIN_NOW roster + WIN_NOW trajectory (aggressive, mortgaging future)
 * Win-Now    → WIN_NOW roster, stable/plateau window
 * Contender  → WIN_NOW roster on the rise, or balanced team near their peak
 * Youth-Build → ASCENDING trajectory — young team investing in upside
 * Rebuild    → REBUILD signals without full teardown
 * Tank       → REBUILD roster + REBUILD trajectory (full teardown)
 */
export function getTrajectoryLabel(profile: DraftProfile): string {
    const { teamMode, trajectoryWindow } = profile;
    if (teamMode === 'WIN_NOW' && trajectoryWindow === 'WIN_NOW')   return 'All-In';
    if (teamMode === 'WIN_NOW' && trajectoryWindow === 'ASCENDING') return 'Contender';
    if (teamMode === 'WIN_NOW')                                      return 'Win-Now';
    if (teamMode === 'REBUILD' && trajectoryWindow === 'REBUILD')   return 'Tank';
    if (teamMode === 'REBUILD' && trajectoryWindow === 'ASCENDING') return 'Youth-Build';
    if (teamMode === 'REBUILD')                                      return 'Rebuild';
    // BALANCED
    if (trajectoryWindow === 'WIN_NOW')   return 'Contender';
    if (trajectoryWindow === 'ASCENDING') return 'Youth-Build';
    if (trajectoryWindow === 'REBUILD')   return 'Rebuild';
    return 'Contender'; // BALANCED + PLATEAU — solid, competitive team
}

// Shared position normalizer — IDP variants all collapse to 'IDP'.
const IDP_POSITIONS = new Set([
    'DE', 'DT', 'NT', 'DL', 'EDGE',
    'OLB', 'ILB', 'MLB', 'LB',
    'CB', 'FS', 'SS', 'NB', 'S', 'DB', 'SAF',
    'IDP', 'IDPFLEX', 'IDP_FLEX',
]);

export function normalizePosition(position: string): string {
    return IDP_POSITIONS.has(position) ? 'IDP' : position;
}

/** FiQ tier number from score. 1 = Elite, 5 = Developmental. */
export function getTier(fiqScore: number): number {
    if (fiqScore >= 85) return 1;
    if (fiqScore >= 78) return 2;
    if (fiqScore >= 70) return 3;
    if (fiqScore >= 62) return 4;
    return 5;
}

// ── Team Mode (roster snapshot) ───────────────────────────────────────────────

export interface RosterProfile {
    position: string;   // already normalized
    age:      number | null;
    fiqScore: number | null;
}

/**
 * Derives WIN_NOW / BALANCED / REBUILD from three independent signals:
 * 1. Age Curve   — avg skill-position age
 * 2. Starter Quality — avg FiQ of skill positions
 * 3. Positional Stability — fraction of target slots filled
 *
 * Each signal votes +1 (WIN_NOW), 0 (BALANCED), or -1 (REBUILD).
 * Sum ≥ 2 → WIN_NOW, ≤ -2 → REBUILD, else BALANCED.
 * Falls back to BALANCED when not enough data (< 4 skill players).
 */
export function computeTeamMode(profiles: RosterProfile[]): TeamMode {
    const skill = profiles.filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p.position));
    if (skill.length < 4) return 'BALANCED';

    // Signal 1: Age Curve
    const ages = skill.filter(p => p.age != null).map(p => p.age!);
    let ageSignal = 0;
    if (ages.length >= 3) {
        const avg = ages.reduce((a, b) => a + b, 0) / ages.length;
        if (avg >= 27)      ageSignal =  1;
        else if (avg <= 24) ageSignal = -1;
    }

    // Signal 2: Starter Quality
    const fiqs = skill.filter(p => p.fiqScore != null).map(p => p.fiqScore!);
    let strengthSignal = 0;
    if (fiqs.length >= 3) {
        const avg = fiqs.reduce((a, b) => a + b, 0) / fiqs.length;
        if (avg >= 65)      strengthSignal =  1;
        else if (avg <= 45) strengthSignal = -1;
    }

    // Signal 3: Positional Stability
    const counts: Record<string, number> = {};
    for (const p of profiles) counts[p.position] = (counts[p.position] ?? 0) + 1;
    const filled = [
        (counts['QB'] ?? 0) >= 1,
        (counts['RB'] ?? 0) >= 3,
        (counts['WR'] ?? 0) >= 4,
        (counts['TE'] ?? 0) >= 1,
    ].filter(Boolean).length;
    let stabilitySignal = 0;
    if (filled >= 3)      stabilitySignal =  1;
    else if (filled <= 1) stabilitySignal = -1;

    const total = ageSignal + strengthSignal + stabilitySignal;
    if (total >= 2) return 'WIN_NOW';
    if (total <= -2) return 'REBUILD';
    return 'BALANCED';
}

// ── Draft Pool ADP ────────────────────────────────────────────────────────────

/**
 * Pool-relative ADP entry for a single player.
 * adpRankInPool = FPDO (Fantasy Positional Draft Order): 1-based rank within the
 * player's position group. Rookies sorted by NFL draft pick; startup/FA sorted by
 * KTC value desc. Rank 1 = first player taken at this position.
 * Exposed to the UI as "ADP" — users don't need to know the acronym FPDO.
 */
export interface DraftPoolADPEntry {
    playerId:      string;
    isRookie:      boolean;
    isVet:         boolean;
    adpRankInPool: number;          // 1 = top of pool
    adpSource:     'rookie' | 'fa' | 'blended';
}

/**
 * Delta helper: positive = value (drafted later than expected),
 * negative = reach (drafted earlier than expected).
 */
export function getDraftPoolADPDelta(
    draftPoolADP:      Record<string, DraftPoolADPEntry>,
    playerId:          string,
    overallPickNumber: number,
): number | null {
    const entry = draftPoolADP[playerId];
    if (!entry) return null;
    return overallPickNumber - entry.adpRankInPool;
}

// ── Draft Context ─────────────────────────────────────────────────────────────

export interface DraftContext {
    leagueId:         string;
    sleeperLeagueId:  string;
    sleeperDraftId:   string;
    draftType:        DraftType;
    draftProfile:     DraftProfile;

    scoring: {
        ppr:         boolean;
        superflex:   boolean;
        tePremium:   boolean;
        bestBall:    boolean;
        rosterSlots: Record<string, number>;
    };

    draftMeta: {
        totalTeams:         number;
        totalRounds:        number;
        currentRound:       number;
        currentPickOverall: number;
        picksPerRound:      number;
        onTheClockRosterId: string | null;
    };

    picksSoFar: {
        pickOverall:     number;
        round:           number;
        rosterId:        string;
        sleeperPlayerId: string;
    }[];

    myRoster:          { sleeperPlayerId: string; position: string }[];
    fullRoster:        { sleeperPlayerId: string; position: string }[];
    myEffectiveRoster: { sleeperPlayerId: string; position: string }[];

    availablePlayers: {
        sleeperPlayerId:  string;
        name:             string;
        position:         string;
        team:             string | null;
        age:              number | null;
        fiqScore:         number;          // 0–100
        tier:             number;          // 1–5 FiQ tier
        opportunityScore: number | null;   // 0–100 year-1 role signal (rookies only)
    }[];

    /** All player IDs in the draft pool, ordered by pool rank (best first). */
    draftPoolPlayers: string[];

    /** Pool-relative ADP by sleeperPlayerId — includes drafted players. */
    draftPoolADP: Record<string, DraftPoolADPEntry>;

    /** Diagnostic info about how the user's roster was resolved. */
    binding: {
        rosterFound:       boolean;
        resolvedRosterId:  number | null;    // actual roster_id that was bound
        rosterPlayerCount: number;           // existing players on the roster
        myPickCount:       number;           // picks made in this draft
        sleeperUserIdUsed: string | null;    // sleeperUserId that was matched (or null)
        boundByOwnerId:    boolean;          // true = owner_id match, false = rosterId fallback
    };
}
