import type {
    MockDraftState,
    MockDraftStepResult,
    MockLeagueContext,
    MockDraftBoard,
    MockDraftResult,
} from './types';
import { filterAvailablePlayers } from './DraftBoardEngine';
import { rankCandidatesForTeam } from './ScoringEngine';
import { computeNeedsProfile, updateNeedsAfterPick } from './NeedsEngine';

export function initializeDraftState(context: MockLeagueContext): MockDraftState {
    const teamNeeds = new Map(
        context.teams.map(t => [
            t.teamId,
            computeNeedsProfile(t.rosterByPosition, context.settings),
        ]),
    );
    return {
        currentPickIndex: 0,
        draftedIds:       new Set(),
        results:          [],
        teamNeeds,
    };
}

// Processes auto-picks until either the user's turn arrives or the draft ends.
export function runUntilUserPick(
    state:   MockDraftState,
    context: MockLeagueContext,
    board:   MockDraftBoard,
): MockDraftStepResult {
    const teamMap   = new Map(context.teams.map(t => [t.teamId, t]));
    const ownerMap  = new Map(context.teams.map(t => [t.teamId, t.ownerName]));

    let idx       = state.currentPickIndex;
    let drafted   = state.draftedIds;
    const results = [...state.results];
    const needs   = new Map(state.teamNeeds);

    while (idx < context.draftOrder.length) {
        const pick = context.draftOrder[idx];

        if (pick.teamId === context.yourTeamId) {
            const available = filterAvailablePlayers(board, drafted);
            return {
                state:            'USER_ON_THE_CLOCK',
                currentPick:      pick,
                availablePlayers: available,
                draftState:       { currentPickIndex: idx, draftedIds: drafted, results, teamNeeds: needs },
            };
        }

        const team = teamMap.get(pick.teamId);
        if (!team) { idx++; continue; }

        const available = filterAvailablePlayers(board, drafted);
        if (available.length === 0) break;

        const teamNeeds  = needs.get(pick.teamId) ?? team.needsProfile;
        const ranked     = rankCandidatesForTeam(available, teamNeeds, team.personality);
        if (ranked.length === 0) break;

        const { player, breakdown } = ranked[0];

        results.push({
            pick,
            teamId:    pick.teamId,
            ownerName: ownerMap.get(pick.teamId) ?? 'Team',
            player,
            source:    'AUTO',
            scoreBreakdown: breakdown,
        } satisfies MockDraftResult);

        const newDrafted = new Set(drafted);
        newDrafted.add(player.playerId);
        drafted = newDrafted;

        needs.set(pick.teamId, updateNeedsAfterPick(teamNeeds, player, context.settings));
        idx++;
    }

    return { state: 'DRAFT_COMPLETE', results };
}

// Records the user's pick and advances the pick index by one.
export function applyUserPick(
    state:    MockDraftState,
    context:  MockLeagueContext,
    board:    MockDraftBoard,
    playerId: string,
): MockDraftState {
    const pick   = context.draftOrder[state.currentPickIndex];
    const player = board.players.find(p => p.playerId === playerId);
    const ownerMap = new Map(context.teams.map(t => [t.teamId, t.ownerName]));

    if (!player || !pick) return state;

    const result: MockDraftResult = {
        pick,
        teamId:    context.yourTeamId,
        ownerName: ownerMap.get(context.yourTeamId) ?? 'You',
        player,
        source:    'USER',
        scoreBreakdown: { base: player.baseScore / 100, need: 0, chaos: 0, total: player.baseScore / 100 },
    };

    const newDraftedIds = new Set(state.draftedIds);
    newDraftedIds.add(playerId);

    const newTeamNeeds  = new Map(state.teamNeeds);
    const currentNeeds  = state.teamNeeds.get(context.yourTeamId);
    if (currentNeeds) {
        newTeamNeeds.set(
            context.yourTeamId,
            updateNeedsAfterPick(currentNeeds, player, context.settings),
        );
    }

    return {
        currentPickIndex: state.currentPickIndex + 1,
        draftedIds:       newDraftedIds,
        results:          [...state.results, result],
        teamNeeds:        newTeamNeeds,
    };
}

// Continues the simulation after the user picks.
export function resumeAfterUserPick(
    state:   MockDraftState,
    context: MockLeagueContext,
    board:   MockDraftBoard,
): MockDraftStepResult {
    return runUntilUserPick(state, context, board);
}
