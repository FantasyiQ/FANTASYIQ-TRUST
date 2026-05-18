// FantasyiQ Trust — Live Draft Assistant v1 — Core Types

export type DraftType = 'rookie' | 'startup';

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

    myRoster: {
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
