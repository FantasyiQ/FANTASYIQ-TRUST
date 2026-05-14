/**
 * Pure utilities for the Rankings hub tab.
 * Projections only — no auction values.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RankingPlayer {
    playerId:     string;
    name:         string;
    position:     string;
    team:         string;
    injuryStatus: string | null;
    baseProj:     number;
}

export type SortKey = 'baseProj' | 'position' | 'name';
export type SortDir = 'asc' | 'desc';

// ── Styling maps ──────────────────────────────────────────────────────────────

export const POS_COLORS: Record<string, string> = {
    QB:  'bg-red-900/40 text-red-300 border-red-800',
    RB:  'bg-green-900/40 text-green-300 border-green-800',
    WR:  'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:  'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    K:   'bg-purple-900/40 text-purple-300 border-purple-800',
    DEF: 'bg-gray-800 text-gray-300 border-gray-700',
};

// ── Value formatting ──────────────────────────────────────────────────────────

export function formatProj(proj: number): string {
    return proj.toFixed(1);
}

// ── Sort & filter ─────────────────────────────────────────────────────────────

export function filterPlayers(
    players:   RankingPlayer[],
    posFilter: string,
    search:    string,
): RankingPlayer[] {
    let list = players;

    if (posFilter !== 'ALL') {
        list = list.filter(p => p.position === posFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
        list = list.filter(
            p => p.name.toLowerCase().includes(q) ||
                 p.team.toLowerCase().includes(q),
        );
    }

    return list;
}

export function sortPlayers(
    players: RankingPlayer[],
    key:     SortKey,
    dir:     SortDir,
): RankingPlayer[] {
    return [...players].sort((a, b) => {
        let diff: number;
        switch (key) {
            case 'baseProj': diff = a.baseProj - b.baseProj; break;
            case 'position': diff = a.position.localeCompare(b.position); break;
            case 'name':     diff = a.name.localeCompare(b.name); break;
            default:         diff = 0;
        }
        if (diff === 0) diff = a.name.localeCompare(b.name);
        return dir === 'desc' ? -diff : diff;
    });
}

export function sortArrow(colKey: SortKey, activeKey: SortKey, dir: SortDir): string {
    if (colKey !== activeKey) return '';
    return dir === 'desc' ? ' ↓' : ' ↑';
}
