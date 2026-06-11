import type { MockDraftBoard, MockPlayer } from './types';

export function filterAvailablePlayers(
    board: MockDraftBoard,
    draftedIds: Set<string>,
): MockPlayer[] {
    return board.players.filter(p => !draftedIds.has(p.playerId));
}
