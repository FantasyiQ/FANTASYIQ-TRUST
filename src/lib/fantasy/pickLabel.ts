/**
 * Human-readable label for a draft pick.
 *
 * - Exact slot (draft_order known, `slot` set): "1.05"
 * - Tier pick (no draft_order, `tier` set):     "Early 1st", "Mid 2nd", "Late 3rd"
 *
 * The `draftCompleted` flag is intentionally NOT a parameter — we derive intent from
 * whether `slot` is present. A pick with a known slot always came from a real draft;
 * a pick with only a `tier` is always a future/frozen tier estimate.
 */
const ROUND_ORDS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export function buildPickLabel(op: {
    round:  number;
    slot?:  number;
    tier?:  string;
}): string {
    if (op.slot !== undefined) {
        return `${op.round}.${op.slot.toString().padStart(2, '0')}`;
    }
    const ord = ROUND_ORDS[op.round - 1] ?? `${op.round}th`;
    return `${op.tier ?? 'Mid'} ${ord}`;
}
