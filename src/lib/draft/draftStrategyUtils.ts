/**
 * Pure utilities for Draft Strategy Preview.
 * No React or browser dependencies — fully testable and importable in both
 * server components and client components.
 */

// ── Shared types ──────────────────────────────────────────────────────────────

export interface StartersPerTeam {
    QB:  number;
    RB:  number;
    WR:  number;
    TE:  number;
    K:   number;
    DEF: number;
    [key: string]: number;
}

// ── Roster template parsing ───────────────────────────────────────────────────

// Non-starter slots (bench, IR, taxi) — excluded from counts
const NON_STARTER_SLOTS = new Set(['BN', 'IR', 'TAXI', 'IL', 'SFLEX']);

// Direct skill positions
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

// Flex → eligible positions (same as auction engine)
const FLEX_CONTRIBUTIONS: Record<string, readonly string[]> = {
    FLEX:       ['RB', 'WR'],
    SUPER_FLEX: ['QB', 'RB', 'WR'],
    REC_FLEX:   ['WR', 'TE'],
    WRRB_FLEX:  ['RB', 'WR'],
};

/**
 * Count starter slots per position per team from a rosterPositions template.
 * Returns a map: position → count per team.
 */
export function countStartersPerTeam(rosterPositions: string[]): StartersPerTeam {
    const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };

    for (const slot of rosterPositions) {
        if (NON_STARTER_SLOTS.has(slot)) continue;

        if (SKILL_POSITIONS.has(slot)) {
            counts[slot] = (counts[slot] ?? 0) + 1;
        } else {
            const flex = FLEX_CONTRIBUTIONS[slot];
            if (flex) {
                for (const pos of flex) {
                    counts[pos] = (counts[pos] ?? 0) + 1;
                }
            }
        }
    }

    return counts as StartersPerTeam;
}

// ── Draft status display ──────────────────────────────────────────────────────

export type DraftVariant = 'none' | 'upcoming' | 'urgent' | 'done';

/**
 * @param draftStartTimeMs  epoch ms (number), null if not scheduled
 * @param draftStatus       Sleeper draft status string
 * @param now               current epoch ms (optional, defaults to Date.now())
 */
export function getDraftDisplay(
    draftStartTimeMs: number | null,
    draftStatus:      string | null,
    now              = Date.now(),
): { text: string; variant: DraftVariant } {
    if (!draftStartTimeMs) return { text: 'Draft Date: Not Scheduled', variant: 'none' };

    if (draftStatus === 'complete') return { text: 'Draft Completed', variant: 'done' };

    const msUntil = draftStartTimeMs - now;

    if (msUntil <= 0 && draftStatus !== 'drafting') return { text: 'Draft Completed', variant: 'done' };
    if (draftStatus === 'drafting')                  return { text: 'Draft In Progress', variant: 'urgent' };

    const draftDate  = new Date(draftStartTimeMs);
    const timeStr    = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short',
    }).format(draftDate);
    const hoursUntil = msUntil / (1000 * 60 * 60);
    const daysUntil  = Math.floor(msUntil / (1000 * 60 * 60 * 24));

    if (hoursUntil < 24) return { text: `Draft Today · ${timeStr}`, variant: 'urgent' };

    if (daysUntil < 30)  return { text: `Draft in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, variant: 'upcoming' };

    const dateStr = new Intl.DateTimeFormat('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
    }).format(draftDate);

    return { text: `Draft Date: ${dateStr} · ${timeStr}`, variant: 'upcoming' };
}

export function draftVariantBadgeClass(variant: DraftVariant): string {
    switch (variant) {
        case 'upcoming': return 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/40';
        case 'urgent':   return 'bg-red-900/30 text-red-400 border-red-800';
        case 'done':     return 'bg-gray-800 text-gray-500 border-gray-700';
        default:         return 'bg-gray-800/50 text-gray-600 border-gray-700/50';
    }
}

