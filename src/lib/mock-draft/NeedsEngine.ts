import type { MockPlayer, NeedsProfile, MockDraftSettings } from './types';

const FLEX_ELIGIBLE = new Set(['RB', 'WR', 'TE']);

// ── Rookie-draft needs ────────────────────────────────────────────────────────
// Dynasty teams already have full rosters, so counting raw players always returns
// 0% urgency. Instead we count "quality assets" — players with meaningful dynasty
// value — and compare against a target depth per position.
//
// qualityCountByPosition: how many dynasty assets above the value threshold each
// team has at each position. Passed in from the API route after loading FC values.

const ROOKIE_DEPTH_TARGETS: Record<string, number> = {
    QB: 2,   // starter + 1 quality backup
    RB: 5,   // 2 starters + 3 depth pieces
    WR: 6,   // 2–3 starters + 3 depth pieces
    TE: 2,   // starter + 1 backup
};

export function computeRookieDraftNeeds(
    qualityCountByPosition: Record<string, number>,
): NeedsProfile {
    const need = (pos: string): number => {
        const target = ROOKIE_DEPTH_TARGETS[pos] ?? 3;
        const have   = qualityCountByPosition[pos] ?? 0;
        return Math.max(0, Math.min(1, (target - have) / target));
    };

    return {
        QB:   need('QB'),
        RB:   need('RB'),
        WR:   need('WR'),
        TE:   need('TE'),
        FLEX: Math.max(need('RB'), need('WR')) * 0.6,
    };
}

export function computeNeedsProfile(
    rosterByPosition: Record<string, number>,
    settings: MockDraftSettings,
): NeedsProfile {
    const slots = settings.starterSlots;
    const flexSlots = slots['FLEX'] ?? 0;

    const urgency = (pos: string, target: number): number => {
        if (target <= 0) return 0;
        const have = rosterByPosition[pos] ?? 0;
        return Math.max(0, Math.min(1, (target - have) / target));
    };

    return {
        QB:   urgency('QB', slots['QB'] ?? 1),
        RB:   urgency('RB', slots['RB'] ?? 2),
        WR:   urgency('WR', slots['WR'] ?? 2),
        TE:   urgency('TE', slots['TE'] ?? 1),
        FLEX: flexSlots > 0
            ? Math.max(
                urgency('RB', (slots['RB'] ?? 2) + flexSlots * 0.5),
                urgency('WR', (slots['WR'] ?? 2) + flexSlots * 0.5),
              )
            : 0,
    };
}

export function getNeedForPosition(needs: NeedsProfile, position: string): number {
    switch (position) {
        case 'QB': return needs.QB;
        case 'RB': return Math.max(needs.RB, needs.FLEX * 0.75);
        case 'WR': return Math.max(needs.WR, needs.FLEX * 0.75);
        case 'TE': return Math.max(needs.TE, needs.FLEX * 0.40);
        default:   return 0;
    }
}

export function updateNeedsAfterPick(
    needs: NeedsProfile,
    player: MockPlayer,
    settings: MockDraftSettings,
): NeedsProfile {
    const slots = settings.starterSlots;
    const pos = player.position;

    const reduce = (current: number, target: number): number =>
        Math.max(0, current - 1 / Math.max(target, 1));

    const isFlexFill = FLEX_ELIGIBLE.has(pos) && needs.FLEX > 0;

    return {
        QB:   pos === 'QB' ? reduce(needs.QB, slots['QB'] ?? 1) : needs.QB,
        RB:   pos === 'RB' ? reduce(needs.RB, slots['RB'] ?? 2) : needs.RB,
        WR:   pos === 'WR' ? reduce(needs.WR, slots['WR'] ?? 2) : needs.WR,
        TE:   pos === 'TE' ? reduce(needs.TE, slots['TE'] ?? 1) : needs.TE,
        FLEX: isFlexFill   ? reduce(needs.FLEX, slots['FLEX'] ?? 1) : needs.FLEX,
    };
}
