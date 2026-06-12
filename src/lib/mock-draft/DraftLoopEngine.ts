import type {
    MockDraftState,
    MockDraftStepResult,
    MockLeagueContext,
    MockDraftBoard,
    MockDraftResult,
} from './types';
import { filterAvailablePlayers } from './DraftBoardEngine';
import { rankCandidatesForTeam } from './ScoringEngine';
import { updateNeedsAfterPick } from './NeedsEngine';

export function initializeDraftState(context: MockLeagueContext): MockDraftState {
    const teamNeeds = new Map(
        context.teams.map(t => [t.teamId, t.needsProfile]),
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

        const teamNeeds = needs.get(pick.teamId) ?? team.needsProfile;

        // QB streaming: in superflex rookie drafts, teams gradually load up on QBs
        // in rounds 3–5. Not every team streams at once — probability scales with
        // round urgency and personality. This creates organic QB runs rather than
        // every QB-starved team piling in simultaneously.
        const isStreamingLeague = context.settings.superflex && context.settings.isRookieDraft;
        const qbsThisTeam = isStreamingLeague
            ? results.filter(r => r.teamId === pick.teamId && r.player.position === 'QB').length
            : Infinity;
        // Probability of streaming: LOW personality waits, HIGH jumps early.
        // Round 3: only ~30–60% of QB-less teams stream. Round 4+: much more urgent.
        const riskMult = team.personality.riskTolerance === 'HIGH' ? 1.4
            : team.personality.riskTolerance === 'LOW' ? 0.5 : 1.0;
        const streamProb = pick.round >= 4
            ? Math.min(0.95, 0.65 * riskMult)   // R4+: 33–91% depending on risk
            : Math.min(0.70, 0.35 * riskMult);  // R3:  18–49% depending on risk
        const shouldStreamQB =
            ((pick.round >= 3 && qbsThisTeam === 0) ||
             (pick.round >= 4 && qbsThisTeam === 1)) &&
            Math.random() < streamProb;

        let player: typeof available[number];
        let breakdown: { base: number; need: number; chaos: number; total: number };

        if (shouldStreamQB) {
            const bestQB = available.find(p => p.position === 'QB');
            if (bestQB) {
                player   = bestQB;
                breakdown = { base: bestQB.baseScore / 100, need: 1, chaos: 0, total: bestQB.baseScore / 100 };
            } else {
                const ranked = rankCandidatesForTeam(available, teamNeeds, team.personality);
                if (ranked.length === 0) break;
                ({ player, breakdown } = ranked[0]);
            }
        } else {
            const ranked = rankCandidatesForTeam(available, teamNeeds, team.personality);
            if (ranked.length === 0) break;
            ({ player, breakdown } = ranked[0]);
        }

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
