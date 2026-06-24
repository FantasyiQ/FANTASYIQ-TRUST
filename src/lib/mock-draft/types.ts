// FantasyiQ Trust — Mock Draft Engine v2 — Core Types

import type { NeedsLabel } from '@/lib/needs/assessTeamNeeds';

export type MockPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'IDP';

export interface MockPlayer {
    playerId:     string;
    name:         string;
    position:     MockPosition;
    team:         string | null;
    age:          number | null;
    tier:         number;       // 1–5 (1 = Elite)
    baseScore:    number;       // 0–100 BPA score
    isRookie:     boolean;
    injuryStatus: string | null;
    imageUrl:     string | null;
    height?:      string | null;   // rookies only (from rookie rankings)
    weight?:      number | null;
    fortyTime?:   number | null;
}

/**
 * Driven by the unified Team Needs model (src/lib/needs). Per position:
 *   base       — verdict urgency (post-caps), static for the draft
 *   picks      — players drafted this session at the position (for decay)
 *   decayDenom — depthTarget(pos); effective = max(0, base - picks/decayDenom)
 *   label/reason — the canonical vocabulary, for UI display
 * Use getNeedForPosition() to read effective urgency (never read base directly).
 */
export interface NeedsProfile {
    base:       Record<string, number>;
    picks:      Record<string, number>;
    decayDenom: Record<string, number>;
    label:      Record<string, NeedsLabel>;
    reason:     Record<string, string>;
}

export interface PersonalityProfile {
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    needBias:      number;   // 0–1: 0 = pure BPA, 1 = pure need
    chaosBias:     number;   // 0–1: randomness amplitude
}

export interface MockTeam {
    teamId:          string;    // Sleeper roster_id as string
    ownerName:       string;
    isUser:          boolean;
    rosterByPosition: Record<string, number>;  // existing starters per position
    needsProfile:    NeedsProfile;
    personality:     PersonalityProfile;
}

export interface MockDraftSettings {
    totalTeams:    number;
    totalRounds:   number;
    isSnake:       boolean;
    superflex:     boolean;
    tePremium:     boolean;
    isDynasty:     boolean;
    isRookieDraft: boolean;
    starterSlots:  Record<string, number>;   // QB:1, RB:2, WR:2, TE:1, FLEX:n, K:1, DEF:1
    draftMode:     'dynasty' | 'redraft' | 'rookie';
}

export interface MockDraftPick {
    overall: number;
    round:   number;
    slot:    number;
    teamId:  string;
}

export interface MockDraftResult {
    pick:     MockDraftPick;
    teamId:   string;
    ownerName: string;
    player:   MockPlayer;
    source:   'AUTO' | 'USER';
    scoreBreakdown: {
        base:  number;
        need:  number;
        chaos: number;
        total: number;
    };
}

export interface MockLeagueContext {
    leagueId:    string;
    leagueName:  string;
    yourTeamId:  string;
    teams:       MockTeam[];
    draftOrder:  MockDraftPick[];
    settings:    MockDraftSettings;
}

export interface MockDraftBoard {
    players: MockPlayer[];   // BPA-sorted, baseScore desc
}

export interface MockDraftState {
    currentPickIndex: number;
    draftedIds:       Set<string>;
    results:          MockDraftResult[];
    teamNeeds:        Map<string, NeedsProfile>;
}

export type MockDraftStepResult =
    | {
        state:            'USER_ON_THE_CLOCK';
        currentPick:      MockDraftPick;
        availablePlayers: MockPlayer[];
        draftState:       MockDraftState;
      }
    | {
        state:   'DRAFT_COMPLETE';
        results: MockDraftResult[];
      };

export interface MockDraftInitResponse {
    context: MockLeagueContext;
    board:   MockDraftBoard;
}
