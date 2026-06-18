import type { MockPlayer, NeedsProfile, PersonalityProfile } from './types';
import { getNeedForPosition } from './NeedsEngine';

export interface ScoreBreakdown {
    base:  number;
    need:  number;
    chaos: number;
    total: number;
}

// Weights: 60% FiQ/BPA score, 25% positional need, 15% chaos.
//
// Chaos is a per-POSITION roll (not per-player). Every player at the same
// position gets the same position-level random multiplier (posChaosMultiplier),
// so chaos can cause a team to prefer WR over RB this pick — but the best WR
// available ALWAYS beats the second-best WR on the chaos term. A lower-ranked
// player at the same position can never be pushed ahead of a higher-ranked one.
//
// posQuality: 1.0 for the best player at a position in the top 10, scaling down
// for subsequent players at the same position. This locks in intra-position BPA.

export function scorePlayerForTeam(
    player:            MockPlayer,
    needs:             NeedsProfile,
    bpaIndex:          number,      // 0-based overall BPA rank (guard: >= maxCandidates → -Infinity)
    positionalRank:    number,      // 0-based rank within position among candidates (0 = best)
    positionalTotal:   number,      // how many of this position are in the candidate window
    posChaosMultiplier: number,     // per-position random [0–1], same for all players at this pos
    personality:       PersonalityProfile,
    maxCandidates:     number = 10,
): { score: number; breakdown: ScoreBreakdown } {
    if (bpaIndex >= maxCandidates) {
        return { score: -Infinity, breakdown: { base: 0, need: 0, chaos: 0, total: -Infinity } };
    }

    const base = player.baseScore / 100;
    const need = getNeedForPosition(needs, player.position);

    // Best player at position gets posQuality = 1.0; each subsequent player at
    // the same position gets a proportionally lower score. Ensures intra-position
    // BPA is always respected — no lower-ranked player beats a higher-ranked one.
    const posQuality = positionalTotal > 1
        ? 1 - positionalRank / positionalTotal
        : 1.0;
    const chaos = posQuality * posChaosMultiplier * personality.chaosBias;

    const total = 0.60 * base + 0.25 * need + 0.15 * chaos;

    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
        score: total,
        breakdown: {
            base:  r3(base),
            need:  r3(need),
            chaos: r3(chaos),
            total: r3(total),
        },
    };
}

// Best Fit: looks at a wider pool (top 30) and weights need heavily (60%) over
// base score (40%), with no chaos. Surfaces the best available player at positions
// you actually need, even if they sit outside the top 10 BPA window.
export function rankBestFitForTeam(
    available: MockPlayer[],
    needs:     NeedsProfile,
): { player: MockPlayer; score: number }[] {
    const pool = available.slice(0, 30);
    return pool
        .map(player => {
            const base = player.baseScore / 100;
            const need = getNeedForPosition(needs, player.position);
            const score = 0.40 * base + 0.60 * need;
            return { player, score };
        })
        .sort((a, b) => b.score - a.score);
}

// Ranks the top N BPA candidates for a team (default 10, pass 15 for redraft).
// One chaos roll per position per call — so across a single pick, all WRs share
// the same positional chaos weight, all RBs share theirs, etc.
export function rankCandidatesForTeam(
    available:     MockPlayer[],
    needs:         NeedsProfile,
    personality:   PersonalityProfile,
    maxCandidates: number = 10,
): { player: MockPlayer; score: number; breakdown: ScoreBreakdown }[] {
    const pool = available.slice(0, maxCandidates);

    const posCounts  = new Map<string, number>();
    const posRankOf  = new Map<string, number>();  // playerId → 0-based positional rank
    for (const p of pool) {
        const rank = posCounts.get(p.position) ?? 0;
        posRankOf.set(p.playerId, rank);
        posCounts.set(p.position, rank + 1);
    }

    const posChaos = new Map<string, number>();
    for (const pos of posCounts.keys()) {
        posChaos.set(pos, Math.random());
    }

    return pool
        .map((player, i) => {
            const posRank       = posRankOf.get(player.playerId) ?? 0;
            const posTotal      = posCounts.get(player.position)  ?? 1;
            const posChaosMult  = posChaos.get(player.position)   ?? 0;
            const { score, breakdown } = scorePlayerForTeam(
                player, needs, i, posRank, posTotal, posChaosMult, personality, maxCandidates,
            );
            return { player, score, breakdown };
        })
        .filter(x => x.score > -Infinity)
        .sort((a, b) => b.score - a.score);
}
