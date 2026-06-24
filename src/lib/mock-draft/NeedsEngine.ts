import type { MockPlayer, NeedsProfile, MockDraftSettings } from './types';
import { depthTarget, type PositionVerdict } from '@/lib/needs/assessTeamNeeds';

/**
 * Mock-draft needs are now driven by the unified Team Needs model
 * (src/lib/needs/assessTeamNeeds). This file is the thin adapter that turns
 * verdicts into a NeedsProfile the scoring loop consumes, plus the per-pick
 * decay that keeps the CPU from tunnelling on one position.
 *
 * FLEX is folded into starter targets inside deriveSlots — there is NO
 * post-urgency FLEX blending here.
 */

// Build a NeedsProfile from unified verdicts. decayDenom = depthTarget(pos),
// so each pick at a position lowers its urgency by 1/depthTarget.
export function buildNeedsProfile(
    verdicts: PositionVerdict[],
    startersByPos: Record<string, number>,
): NeedsProfile {
    const base:       Record<string, number> = {};
    const picks:      Record<string, number> = {};
    const decayDenom: Record<string, number> = {};
    const label:      Record<string, PositionVerdict['label']>  = {};
    const reason:     Record<string, string> = {};

    for (const v of verdicts) {
        base[v.position]       = v.urgency;
        picks[v.position]      = 0;
        decayDenom[v.position] = Math.max(1, depthTarget(startersByPos[v.position] ?? 1));
        label[v.position]      = v.label;
        reason[v.position]     = v.reason;
    }
    return { base, picks, decayDenom, label, reason };
}

// Effective urgency = base verdict urgency, decayed by picks already spent at
// the position this draft (floored at 0). Single source for scoring + UI.
export function getNeedForPosition(needs: NeedsProfile, position: string): number {
    const base  = needs.base[position] ?? 0;
    const denom = Math.max(1, needs.decayDenom[position] ?? 1);
    const picks = needs.picks[position] ?? 0;
    return Math.max(0, base - picks / denom);
}

// After a pick, increment that position's session pick count (immutable).
// IDP board players are already bucketed to 'IDP', so position maps directly.
export function updateNeedsAfterPick(
    needs: NeedsProfile,
    player: MockPlayer,
    _settings: MockDraftSettings,
): NeedsProfile {
    const pos = player.position;
    return {
        ...needs,
        picks: { ...needs.picks, [pos]: (needs.picks[pos] ?? 0) + 1 },
    };
}
