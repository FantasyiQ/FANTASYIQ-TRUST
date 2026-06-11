import type { MockPlayer, NeedsProfile, PersonalityProfile } from './types';
import { getNeedForPosition } from './NeedsEngine';

export interface ScoreBreakdown {
    base:  number;
    need:  number;
    chaos: number;
    total: number;
}

// Scores a player for a specific team at a given BPA position.
// bpaIndex is 0-based within the current available list (0 = top BPA).
// Returns -Infinity if the player is outside the 10-player reach window.
export function scorePlayerForTeam(
    player:      MockPlayer,
    needs:       NeedsProfile,
    bpaIndex:    number,
    personality: PersonalityProfile,
): { score: number; breakdown: ScoreBreakdown } {
    if (bpaIndex > 9) {
        return { score: -Infinity, breakdown: { base: 0, need: 0, chaos: 0, total: -Infinity } };
    }

    const base  = player.baseScore / 100;
    const need  = getNeedForPosition(needs, player.position);
    const chaos = Math.random() * personality.chaosBias;
    const total = 0.55 * base + 0.25 * need + 0.20 * chaos;

    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    return {
        score: total,
        breakdown: {
            base:  round3(base),
            need:  round3(need),
            chaos: round3(chaos),
            total: round3(total),
        },
    };
}

// Ranks the top 10 BPA candidates for a team, returning them sorted by their
// need-weighted+chaos score.
export function rankCandidatesForTeam(
    available:   MockPlayer[],
    needs:       NeedsProfile,
    personality: PersonalityProfile,
): { player: MockPlayer; score: number; breakdown: ScoreBreakdown }[] {
    return available
        .slice(0, 10)
        .map((player, i) => {
            const { score, breakdown } = scorePlayerForTeam(player, needs, i, personality);
            return { player, score, breakdown };
        })
        .filter(x => x.score > -Infinity)
        .sort((a, b) => b.score - a.score);
}
