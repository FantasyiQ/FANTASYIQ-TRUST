const BASE = 'https://api.sleeper.app/v1';

export interface SleeperUser {
    user_id: string;
    username: string;
    display_name: string;
    avatar: string | null;
}

export interface SleeperLeague {
    league_id: string;
    name: string;
    season: string;
    status: string; // pre_draft | drafting | in_season | complete
    total_rosters: number;
    avatar: string | null;
    settings: {
        type: number;           // 0 = redraft, 2 = dynasty
        draft_rounds?: number;  // number of rounds in the rookie/startup draft
        playoff_teams?: number;
        trade_deadline?: number;
    };
    scoring_settings: {
        rec?:              number;   // PPR value (0 / 0.5 / 1)
        pass_td?:          number;   // passing TD pts (4 or 6)
        bonus_rec_te?:     number;   // TE bonus per reception
        fum_lost?:         number;   // fumble penalty
        int?:              number;   // interception penalty
        rush_td?:          number;   // rushing TD pts
        rec_td?:           number;   // receiving TD pts
        bonus_pass_yd_300?: number;  // 300-yd passing bonus
        bonus_rush_yd_100?: number;  // 100-yd rushing bonus
        bonus_rec_yd_100?:  number;  // 100-yd receiving bonus
    };
    roster_positions: string[];
}

export interface SleeperLeagueMember {
    user_id: string;
    username: string;
    display_name: string;
    avatar: string | null;
    metadata: { team_name?: string };
    is_owner?: boolean;
}

export interface SleeperRoster {
    roster_id: number;
    owner_id: string | null;
    players: string[] | null;
    starters: string[] | null;
    // Dynasty: picks this roster currently owns (authoritative — includes cross-season trades)
    draft_picks?: SleeperTradedPick[];
    settings: {
        wins: number;
        losses: number;
        ties?: number;
        fpts: number;
        fpts_decimal?: number;
        ppts?: number;
        ppts_decimal?: number;
    };
}

export interface SleeperMatchup {
    matchup_id: number | null; // null = bye week
    roster_id: number;
    points: number;
    custom_points: number | null;
    starters: string[];
    players: string[];
}

export interface SleeperNflState {
    week: number;
    season: string;
    season_type: string; // pre | regular | post
    display_week: number;
}

// revalidate=0 for cron routes (fresh), default 60s for pages
async function sleeperFetch<T>(path: string, revalidate = 60): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate } });
    if (!res.ok) throw new Error(`Sleeper API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
}

export async function getSleeperUser(username: string): Promise<SleeperUser> {
    return sleeperFetch<SleeperUser>(`/user/${encodeURIComponent(username)}`);
}

export async function getSleeperLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    return sleeperFetch<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`, 0);
}

export async function getNflState(): Promise<SleeperNflState> {
    return sleeperFetch<SleeperNflState>('/state/nfl', 0);
}

export async function getLeague(leagueId: string): Promise<SleeperLeague> {
    return sleeperFetch<SleeperLeague>(`/league/${leagueId}`);
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperLeagueMember[]> {
    return sleeperFetch<SleeperLeagueMember[]>(`/league/${leagueId}/users`);
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    return sleeperFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`, 0);
}

export async function getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return sleeperFetch<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`, 0);
}

export interface SleeperDraft {
    draft_id:    string;
    league_id:   string;
    season:      string;
    status:      string; // pre_draft | drafting | complete
    type:        string; // linear | snake | auction
    // user_id → 1-based draft position (1 = picks first).
    // null when the draft hasn't been configured yet.
    draft_order: Record<string, number> | null;
    settings: {
        rounds: number;
        teams:  number;
    };
}

export async function getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
    return sleeperFetch<SleeperDraft[]>(`/league/${leagueId}/drafts`, 0);
}

/**
 * Build a map of roster_id → draft slot (1-based pick number within each round).
 * Uses the draft's draft_order when available; falls back to standings rank
 * (worst record = slot 1) and marks the result as projected.
 *
 * Returns { slotMap, projected } where projected=true means no real draft order yet.
 */
export function buildRosterSlotMap(
    rosters: SleeperRoster[],
    draft:   SleeperDraft | null,
    standingsRank: Map<number, number>, // roster_id → rank (1=best)
    totalRosters:  number,
): { slotMap: Map<number, number>; projected: boolean } {
    const slotMap = new Map<number, number>();

    if (draft?.draft_order) {
        // draft_order: user_id → draft_position
        for (const roster of rosters) {
            if (!roster.owner_id) continue;
            const slot = draft.draft_order[roster.owner_id];
            if (slot != null) slotMap.set(roster.roster_id, slot);
        }
        // Fill in any roster without an owner (orphaned) using roster_id order
        for (const roster of rosters) {
            if (!slotMap.has(roster.roster_id)) {
                slotMap.set(roster.roster_id, roster.roster_id);
            }
        }
        return { slotMap, projected: false };
    }

    // Fallback: worst record → slot 1, best record → slot n
    for (const roster of rosters) {
        const rank = standingsRank.get(roster.roster_id) ?? roster.roster_id;
        slotMap.set(roster.roster_id, totalRosters - rank + 1);
    }
    return { slotMap, projected: true };
}

export interface SleeperTradedPick {
    season:           string;
    round:            number;
    roster_id:        number;  // original team whose pick this is
    previous_owner_id: number;
    owner_id:         number;  // current owner
}

export async function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
    return sleeperFetch<SleeperTradedPick[]>(`/league/${leagueId}/traded_picks`, 0);
}

// ─── Player cache ──────────────────────────────────────────────────────────────

export interface SlimPlayer {
    full_name: string;
    position: string;
    team: string;
}

/**
 * Look up players by ID from the local DB (populated daily by /api/cron/sleeper-players).
 * Pass an array of IDs to fetch only what you need, or omit to get everything.
 */
export async function getPlayers(ids?: string[]): Promise<Record<string, SlimPlayer>> {
    try {
        const { prisma } = await import('./prisma');
        const rows = await prisma.sleeperPlayer.findMany(
            ids?.length ? { where: { playerId: { in: ids } } } : undefined
        );
        const result: Record<string, SlimPlayer> = {};
        for (const r of rows) {
            result[r.playerId] = { full_name: r.fullName, position: r.position, team: r.team };
        }
        return result;
    } catch {
        return {};
    }
}

// ─── Derived helpers ───────────────────────────────────────────────────────────

export function deriveScoringType(league: SleeperLeague): string {
    const rec = league.scoring_settings?.rec ?? 0;
    if (rec === 1) return 'ppr';
    if (rec === 0.5) return 'half_ppr';
    return 'std';
}

export function scoringLabel(scoringType: string): string {
    switch (scoringType) {
        case 'ppr':      return 'PPR';
        case 'half_ppr': return 'Half PPR';
        default:         return 'Standard';
    }
}

export function summariseRosterPositions(positions: string[]): string {
    const counts = new Map<string, number>();
    for (const pos of positions) counts.set(pos, (counts.get(pos) ?? 0) + 1);
    const order = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF', 'BN', 'IR'];
    const parts: string[] = [];
    for (const pos of order) {
        const n = counts.get(pos);
        if (n) {
            parts.push(`${n} ${pos === 'SUPER_FLEX' ? 'SF' : pos}`);
            counts.delete(pos);
        }
    }
    for (const [pos, n] of counts) parts.push(`${n} ${pos}`);
    return parts.join(', ');
}

/** Returns total fantasy points as a float */
export function rosterFpts(settings: SleeperRoster['settings']): number {
    return (settings?.fpts ?? 0) + (settings?.fpts_decimal ?? 0) / 100;
}

/**
 * Build a map of `${season}-${round}-${origRosterId}` → current owner roster_id.
 * Prefers roster.draft_picks when populated (authoritative); falls back to
 * reconstructing from traded_picks trade events.
 */
export function buildPickOwnerMap(
    rosters: SleeperRoster[],
    tradedPicks: SleeperTradedPick[],
    futureSeasons: string[],
): Map<string, number> {
    const map = new Map<string, number>();
    const anyHasDraftPicks = rosters.some(r => r.draft_picks && r.draft_picks.length > 0);
    if (anyHasDraftPicks) {
        for (const roster of rosters) {
            for (const dp of roster.draft_picks ?? []) {
                if (!futureSeasons.includes(dp.season)) continue;
                map.set(`${dp.season}-${Number(dp.round)}-${Number(dp.roster_id)}`, Number(roster.roster_id));
            }
        }
    } else {
        const groups = new Map<string, SleeperTradedPick[]>();
        for (const tp of tradedPicks) {
            const key = `${tp.season}-${Number(tp.round)}-${Number(tp.roster_id)}`;
            const g = groups.get(key) ?? [];
            g.push(tp);
            groups.set(key, g);
        }
        for (const [key, trades] of groups) {
            if (trades.length === 1) {
                map.set(key, Number(trades[0].owner_id));
            } else {
                const prevOwnerIds = new Set(trades.map(t => Number(t.previous_owner_id)));
                const terminal = trades.find(t => !prevOwnerIds.has(Number(t.owner_id)));
                map.set(key, Number(terminal?.owner_id ?? trades[trades.length - 1].owner_id));
            }
        }
    }
    return map;
}

/** True if we should be polling live matchup scores right now (ET game windows) */
export function isGameWindow(): boolean {
    const etString = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const day = et.getDay(); // 0=Sun 1=Mon 4=Thu
    const hour = et.getHours();
    const windows: Record<number, [number, number]> = {
        0: [12, 24], // Sunday noon–midnight
        1: [17, 24], // Monday 5pm–midnight
        4: [17, 24], // Thursday 5pm–midnight
    };
    const w = windows[day];
    return w ? hour >= w[0] && hour < w[1] : false;
}
