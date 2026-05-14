/**
 * DFS Challenge utilities — server-only (imports prisma).
 */
import { prisma } from '@/lib/prisma';

// ── NFL Week ──────────────────────────────────────────────────────────────────

export function currentNflWeek(): { season: number; week: number } {
    const now    = new Date();
    const year   = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const sep1   = new Date(year, 8, 1);
    // First Thursday of September = season opener
    const firstThu = new Date(sep1);
    firstThu.setDate(sep1.getDate() + ((4 - sep1.getDay() + 7) % 7));
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const week = Math.max(1, Math.min(18, Math.floor((now.getTime() - firstThu.getTime()) / msPerWeek) + 1));
    return { season: year, week };
}

// ── Roster slots ─────────────────────────────────────────────────────────────

const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI']);

/**
 * Returns the ordered list of DFS-eligible slots (bench/IR excluded).
 * Duplicate positions (e.g. two RBs) are returned as-is — slot identity is
 * positional, not named.
 */
export function getDFSSlots(rosterPositions: string[]): string[] {
    return rosterPositions.filter(p => !BENCH_SLOTS.has(p));
}

/**
 * Positions eligible to fill each flex slot type.
 */
export const FLEX_ELIGIBILITY: Record<string, string[]> = {
    FLEX:       ['RB', 'WR', 'TE'],
    SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
    REC_FLEX:   ['WR', 'TE'],
    WRRB_FLEX:  ['RB', 'WR'],
    IDP_FLEX:   ['DL', 'LB', 'DB'],
};

// ── Scoring ──────────────────────────────────────────────────────────────────

export function scoringField(
    scoringType: string | null | undefined,
): 'pointsPpr' | 'pointsStd' | 'pointsHalfPpr' {
    if (scoringType === 'std')      return 'pointsStd';
    if (scoringType === 'half_ppr') return 'pointsHalfPpr';
    return 'pointsPpr';
}

export type DFSEntry = { slot: string; playerId: string };

/**
 * Sum projected/actual points for a lineup from PlayerProjection table.
 * Returns 0 for any player without a projection row (bye week, etc.).
 */
export async function scoreLineup(
    entries:     DFSEntry[],
    season:      number,
    week:        number,
    scoringType: string | null | undefined,
): Promise<number> {
    const playerIds = entries.map(e => e.playerId);
    const field     = scoringField(scoringType);

    const rows = await prisma.playerProjection.findMany({
        where:  { playerId: { in: playerIds }, season: String(season), week },
        select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true },
    });

    const byPlayer = new Map(rows.map(r => [r.playerId, r[field] as number]));
    return entries.reduce((sum, e) => sum + (byPlayer.get(e.playerId) ?? 0), 0);
}

// ── Lineup validation ─────────────────────────────────────────────────────────

interface ValidationResult {
    valid:   boolean;
    error?:  string;
}

/**
 * Validate that submitted entries match the league's DFS slot template.
 * - Correct number of entries
 * - Each required slot is filled
 * - Each player exists in SleeperPlayer
 * - Flex positions are eligible
 */
export async function validateLineup(
    entries:          DFSEntry[],
    rosterPositions:  string[],
): Promise<ValidationResult> {
    const slots = getDFSSlots(rosterPositions);

    if (entries.length !== slots.length) {
        return { valid: false, error: `Expected ${slots.length} players, got ${entries.length}` };
    }

    // Count required slots
    const required: Record<string, number> = {};
    for (const s of slots) required[s] = (required[s] ?? 0) + 1;

    // Count submitted slots
    const submitted: Record<string, number> = {};
    for (const e of entries) submitted[e.slot] = (submitted[e.slot] ?? 0) + 1;

    for (const [slot, count] of Object.entries(required)) {
        if ((submitted[slot] ?? 0) !== count) {
            return { valid: false, error: `Slot ${slot}: need ${count}, got ${submitted[slot] ?? 0}` };
        }
    }

    // Verify all playerIds exist
    const ids      = entries.map(e => e.playerId);
    const existing = await prisma.sleeperPlayer.findMany({
        where:  { playerId: { in: ids } },
        select: { playerId: true, position: true },
    });

    if (existing.length !== ids.length) {
        const found   = new Set(existing.map(p => p.playerId));
        const missing = ids.filter(id => !found.has(id));
        return { valid: false, error: `Unknown player IDs: ${missing.join(', ')}` };
    }

    // Validate flex eligibility
    const posMap = new Map(existing.map(p => [p.playerId, p.position]));
    for (const entry of entries) {
        const eligible = FLEX_ELIGIBILITY[entry.slot];
        if (!eligible) continue; // non-flex slot — position check not needed
        const pos = posMap.get(entry.playerId) ?? '';
        if (!eligible.includes(pos)) {
            return { valid: false, error: `Player in ${entry.slot} must be ${eligible.join('/')}` };
        }
    }

    return { valid: true };
}
