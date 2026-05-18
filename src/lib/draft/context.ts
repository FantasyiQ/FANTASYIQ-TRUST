// FantasyiQ Trust — Live Draft Assistant v1 — Core Types

export type DraftType = 'rookie' | 'startup';

// Shared position normalizer — IDP variants all collapse to 'IDP'.
// Used by both contextLoader and scoring engine.
const IDP_POSITIONS = new Set([
    'DE', 'DT', 'NT', 'DL', 'EDGE',
    'OLB', 'ILB', 'MLB', 'LB',
    'CB', 'FS', 'SS', 'NB', 'S', 'DB', 'SAF',
    'IDP', 'IDPFLEX', 'IDP_FLEX',
]);

export function normalizePosition(position: string): string {
    return IDP_POSITIONS.has(position) ? 'IDP' : position;
}

export interface DraftContext {
    leagueId:         string;   // internal FiQ DB league id
    sleeperLeagueId:  string;
    sleeperDraftId:   string;
    draftType:        DraftType;

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

    /** Players picked in this draft session by my team. */
    myRoster: {
        sleeperPlayerId: string;
        position:        string;
    }[];

    /** Existing Sleeper roster (starters + bench + taxi + IR) before this draft. */
    fullRoster: {
        sleeperPlayerId: string;
        position:        string;
    }[];

    /** fullRoster + picks made so far in this draft — what the team actually has. */
    myEffectiveRoster: {
        sleeperPlayerId: string;
        position:        string;
    }[];

    availablePlayers: {
        sleeperPlayerId: string;
        name:            string;
        position:        string;
        team:            string | null;
        age:             number | null;
        fiqScore:        number;   // 0–100; dynasty KTC normalized or rookie FiQ score
        adp:             number | null;  // Sleeper searchRank — lower = more valued
    }[];
}
